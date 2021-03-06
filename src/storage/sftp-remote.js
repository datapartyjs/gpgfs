const Path = require('path')
const {promisfy, waitFor} = require('promisfy')
const sanitize = require('sanitize-filename')
const debug = require('debug')('gpgfs.sftp-storage')

const SSHClient = require('ssh2').Client
const IStorage = require('../interface-storage')


/**
 * SFTP storage driver
 * @class
 * @implements IStorage
 */
class SFTPStorage extends IStorage {
  
  /*
   * @constructor
   * @param {Object} options 
   * @param {string} options.host               SSH host
   * @param {string} options.port               SSH port
   * @param {string} options.user               SSH user
   * @param {string} options.path               Remote fs path to root of gpgfs file system
   * @param {string} options.agent              Path to SSH agent socket
   * @param {Stream} options.stream             Already connected TCP stream
   * @param {string} options.privateKey         Private key text
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
      
      debug('fileExists', file)
      
      if(!file){return false}
      
      return true
    }
    catch(err){
      debug('fileExists err')
      if(err.message == 'No such file'){ return false }
      
      throw err
    }
  }
  
  async readFile(path=''){
    this.assertEnabled()
    
    debug('readFile',path)
    if(!await this.fileExists(path)){ return }
    
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
    
    const existance = await this.fileExists(path)
    
    const realPath = this.storagePath(path)
    debug("uploading file: " + realPath)
    const fileStream = this.sftp.createWriteStream(realPath, {
      flags: existance ? 'r+' : 'w',
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

  async readDir(path='.'){
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

  async dirExists(path){
    const files = await this.readDir(path)

    return (files.length > 0)
  }
  
 
  async touchDir(path=''){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug('touch dir', realPath)
    const existance = await this.fileExists(path)
    
    if(!existance){
      debug('creating dir', realPath)
      
      const parentPath = path.split('/').slice(0, -1).join('/')
      
      if(this.storagePath(parentPath) != realPath){
        debug('parent', parentPath)
        await this.touchDir(parentPath)
      }
      
      await this.sftpFunc.mkdir(realPath)
    }
    
  }

}

module.exports = SFTPStorage
