const Path = require('path')
const sanitize = require('sanitize-filename')
const debug = require('debug')('gpgfs.sftp-storage')

const SSHClient = require('ssh2').Client
const IStorage = require('../interface-storage')

class GCEStorage extends IStorage {



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
  constructor({host, port, user, path, readOnly=false stream=null, privateKey=null, agent=process.env.SSH_AUTH_SOCK}={}){
    super({readOnly})
    
    this.host = host
    this.port = port
    this.user = user
    this.agent = agent
    this.stream = stream
    this.privateKey = privateKey
    this.basePath = path || 'gpgfs'
    
    this.sftp = null
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
        
        this.sftp = sftpClient
        
        this.sftpPromise = {
          stat: promisify(this.sftp.stat),
          mkdir: promisify(this.sftp.mkdir),
          unlink: promisify(this.sftp.unlink),
          readdir: promisify(this.sftp.readdir),
          ccreateReadStream: promisify(this.sft.createReadStream),
          createWriteStream: promisify(this.sft.createWriteStream)
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
        username: this.host,
        privateKey: this.privateKey,
        agent: this.privateKey ? null : this.agent
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

  async fileExists(path){
    this.assertEnabled()
    const realPath = this.storagePath(path)
    const file = await this.sftp.stat(realPath)
    
    
    
    const result = await file.exists()
    const existance = result[0]

    debug("fileExists: ", existance, realPath)
    return existance
  }
  
  async readFile(path){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug("downloading file: " + realPath)
    const file = this.bucket.file( realPath )
    const downloadResult = await file.download()
    const content = downloadResult[0]
    
    return content
  }

  async writeFile(path, data, options){
    this.assertEnabled()
    if(this.mode!=IStorage.MODE_WRITE){ throw new Error('read only') }
    
    const realPath = this.storagePath(path)
    debug("uploading file: " + realPath)
    const file = this.bucket.file( realPath )
    await file.save(data)
    debug('upload finished:', realPath)
  }

  async rmFile(path){ 
    this.assertEnabled()
    const realPath = this.storagePath(path)
    debug('rmFile -', realPath)
    
    const file = this.bucket.file( realPath )
    await file.delete()
  }

  async readDir(path, options){
    this.assertEnabled()

    path = path.replace(this.basePath, '')

    const realPath = this.storagePath(path)
    debug('readdir', realPath)
    const files = (await this.bucket.getFiles({
      ...options,
/*      delimiter: '/',*/
      directory: realPath
    }))[0]

    const names = files.map(file => {
      let name = file.name.replace(realPath, '')

      name = name.split('/')[1]
      return name

    })
      .filter(name => !name.endsWith('.touch'))
      .filter( (name, idx, arr)=>{
        return arr.indexOf(name) === idx
      })


    debug('files', names)

    return names
  }

  async dirExists(path){
    const files = await this.readDir(path, {maxResults: 1})

    return (files.length > 0)
  }
  
  
  async touchDir(path){
    this.assertEnabled()
    
    const realPath = this.storagePath(path)
    debug('touch dir', realPath)
    const existance = await this.dirExists(realPath)
    
    if(!existance){
      debug('creating dir place holder', realPath)
      await this.writeFile(path+'/.touch', '1')
    }
    
    
  }

}

module.exports = SFTPStorage
