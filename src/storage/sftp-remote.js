const Path = require('path')
const {promisfy, waitFor} = require('promisfy')
const sanitize = require('sanitize-filename')
const debug = require('debug')('gpgfs.sftp-storage')

const SSHClient = require('ssh2').Client
const IStorage = require('../interface-storage')


class SFTPStorage extends IStorage {
  
  /**
   * SFTP storage driver
   * @class
   * @constructor
   * @param {Object} options 
   * @param {string} options.host
   * @param {string} options.port
   * @param {string} options.user
   * @param {string} options.path
   * @param {string} options.agent
   * @param {string} options.stream
   * @param {string} options.privateKey
   * @param {boolean} options.readOnly          Storage open mode
   */
  constructor({host, port, user, path, readOnly=false, stream=null, privateKey=null, agent=process.env.SSH_AUTH_SOCK}={}){
    super({readOnly})
    
    this.host = host
    this.port = port
    this.user = user
    this.agent = agent
    this.stream = stream
    this.privateKey = privateKey
    this.basePath = path || '.gpgfs/'
    
    this.sftp = null
    this.sftpFunc = {}
    this.connection = null
    this.isRelayClient = false
  }

  get name(){ return 'sftp' }
  
  async stop(){
    this.connection.end()
  }

  async openSftp(){
    debug('openSftp')
    if(this.sftp){ return }
    
    return new Promise((resolve, reject)=>{
      
      this.connection.sftp( (err, sftpClient)=>{
        if(err){ return reject(err) }
        
        debug('openSftp - ready')
        
        this.sftp = sftpClient
        

        this.sftpFunc = {
          stat: promisfy(this.sftp.stat, this.sftp),
          mkdir: promisfy(this.sftp.mkdir, this.sftp),
          unlink: promisfy(this.sftp.unlink, this.sftp),
          readdir: promisfy(this.sftp.readdir, this.sftp)
        }
        resolve()
      })
      
    })
  }

  async whileConnected(){
    return new Promise((resolve, reject)=>{
      this.connection.once('end', resolve)
    })
  }

  async start(){
    this.connection = new SSHClient()
    this.connection.once('ready', this.onReady.bind(this))

    let connect = new Promise((resolve,reject)=>{
      let resolved = false
      this.connection.once('ready', ()=>{
        debug('ready', 'connection open')
        this.privateKey=null
        if(!resolved){ resolved=true; resolve() }
      })

      this.connection.once('error', (err)=>{
        debug('error', err)
        this.privateKey=null
        if(!resolved){ resolved=true; reject(err.message) }
      })

      this.connection.once('end', ()=>{
        debug('end')
        this.privateKey=null
        if(!resolved){ resolved=true; reject(new Error('connection denied')) }
      })

    })

    try{

      const connConfig = {
        username: this.user,
        privateKey: this.privateKey,
        agent: this.privateKey ? null : this.agent,
        sock: this.stream,
        host: !this.stream ? this.host : null,
        port: !this.stream ? this.port : null
      }

      if(this.stream){ this.isRelayClient = true }

      this.connection.connect(connConfig)

    }
    catch(err){
      debug('caught err', err)
    }
    
    await connect
    await this.openSftp()
    debug('start',this.sftpFunc)
  }

  async onReady(){
    debug('authed and ready')
  }

  
  
  
  
  

  
  storagePath(path){
    return Path.normalize(
      this.basePath+"/" + Path.dirname(path) + '/'+ sanitize(Path.basename(path))
    )
  }

  get name(){ return 'sftp' }

  async fileExists(path=''){
    this.assertEnabled()
    const realPath = this.storagePath(path)
    
    try{
      const file = await this.sftpFunc.stat(realPath)
      
      if(!file){return false}
      
      return true
    }
    catch(err){
      if(err.message == 'No such file'){ return false }
      
      throw err
    }
  }
  
  async readFile(path=''){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug("downloading file: " + realPath)

    const fileStream = this.sftp.createReadStream(realPath, {
      flags: 'r',
      encoding: null,
      handle: null,
      mode: 0o666,
      autoClose: true
    })
    
    const content = await waitFor(fileStream, 'data')
    
    return content
  }

  async writeFile(path, data){
    this.assertEnabled()
    if(this.mode!=IStorage.MODE_WRITE){ throw new Error('read only') }
    
    const realPath = this.storagePath(path)
    debug("uploading file: " + realPath)
    const fileStream = this.sftp.createWriteStream(realPath, {
      flags: 'r+',
      encoding: null,
      handle: null,
      mode: 0o666,
      autoClose: false
    })
    
    fileStream.end(data)
      
    debug('upload finished:', realPath)
  }

  async rmFile(path){ 
    this.assertEnabled()
    const realPath = this.storagePath(path)
    debug('rmFile -', realPath)
    
    await this.sftpFunc.unlink(realPath)
  }

  async readDir(path='.', options){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug('readdir', realPath)
    
    try{
      const files = await this.sftpFunc.readdir(realPath)

      const names = files.map( file => file.filename )

      return names
    }
    catch(err){
      if(err.message == 'No such file'){ return [] }
      
      throw err
    }
  }

  
  async touchDir(path=''){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug('touch dir', realPath)
    const existance = await this.fileExists(realPath)
    
    if(!existance){
      debug('creating dir place holder', realPath)
      await this.sftpFunc.mkdir(realPath)
    }
    
  }

}

module.exports = SFTPStorage
