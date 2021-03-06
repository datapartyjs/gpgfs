const Path = require('path')
const Hoek = require('@hapi/hoek')
const ObjectId = require('bson-objectid')
const GpgPromised = require('gpg-promised')
const Debug = require('debug')
const debug = Debug('gpgfs.Bucket')


const Utils = require('./utils')
const GpgFsFile = require('./file')
const IStorage = require('./interface-storage')

/** Class representing gpgfs Bucket */
class Bucket {


  /** @hideconstructor */
  constructor({id, name, root}){
    this.id = new ObjectId(id)
    this.name = name
    this.root = root

    this.opened = false
    this.index = null
    this.metadata = null
    this._fileCache = {}
    debug('new -', name || id)

    this.readKeychain = null
    this.metaKeychain = null

    this.keyFingerprints = {
      read: null,
      meta: null
    }

    this.keyPublics = {
      read: null,
      meta: null
    }
  }

  /**
   * Open and read metadata 
   * @method */
  async open(){
    if(this.opened){ return }
    this.index = null
    this.metadata = null
    this._fileCache = {}
    
    await Promise.all([
      this.getIndex(),
      this.getMetadata()
    ])

    /*this.readKeychain = null
    this.metaKeychain = null*/

    await this.loadReadKeys()
    
    this.name = this.metadata.bucketName
    this.opened = true
    debug('loaded ', this.name)
  }

  async release(){
    debug('releasing', this.id.toString())

    for(let id in this._fileCache){
      await this._fileCache[id].release()

      delete this._fileCache[id].bucket
      this._fileCache[id].bucket = null
      delete this._fileCache[id]
    }

    delete this.index
    delete this.metadata
    delete this._fileCache

    this.index = null
    this.metadata = null
    this._fileCache = {}
  }

  async releaseFile(file){
    delete this._fileCache[file.id.toString()]
    this._fileCache[file.id.toString()] = undefined
  }

  /**
   * Check if all metadata exists on disk
   * @method
   * @returns {boolean} */
  async exists(){
    const existance = await Promise.all([
      this.root.fileExists( this.indexPath ),
      this.root.fileExists( this.metadataPath )
    ])
    
    let e = existance[0] && existance[1]
    
    debug('exists', e)
    return e
  }

    /**
   * Create bucket if it does not exist 
   * @method
   */
  async create(){
    debug('create -', this.id)
    await this.root.cacheWhoami()

    //if(this.exists()){ throw new Error('bucket exists') }
    if(await this.root.fileExists( this.readKeyPath )){ throw new Error('bucket read key exists') }
    if(await this.root.fileExists( this.metaReadKeyPath )){ throw new Error('bucket meta read key exists') }
    if(await this.root.fileExists( this.indexPath )){ throw new Error('bucket index exists') }
    if(await this.root.fileExists( this.metadataPath )){ throw new Error('bucket metadata exists') }

    await this.root.touchDir(this.path)
    await this.root.touchDir(this.path + '/keys')
    await this.root.touchDir(this.path + '/objects')
    await this.root.touchDir(this.path + '/object-meta')
    await this.root.touchDir(this.path + '/object-lastchange')

    const nowTime = (new Date()).toISOString()

    const whoami = (await this.root.keychain.whoami())[0]

    //create keys
    debug('create bucket keys')
    await this.createReadKeys()

    //import and trust in root keychain
    debug('import bucket keys', this.keyFingerprints)
    const [[importedReadId], [importedMetaId]] = await Promise.all([
      this.root.keychain.importKey(this.keyPublics.read),
      this.root.keychain.importKey(this.keyPublics.meta)
    ])

    debug('trust keys', importedReadId, importedMetaId)
    await Promise.all([
      this.root.keychain.trustKey( importedReadId, '3' ),
      this.root.keychain.trustKey( importedMetaId, '3' )
    ])

    await this.setMetadata({
      owner: whoami,
      bucketId: {
        id: this.id.toHexString(),
        type: 'bucket_meta'
      },
      bucketKeys: {
        publics: this.keyPublics,
        fingerprints: this.keyFingerprints
      },
      created: nowTime,
      bucketName: this.name,
      cleartext: false,
      meta: [whoami, this.keyFingerprints.meta, this.keyFingerprints.read],
      readers: [whoami, this.keyFingerprints.read],
      writers: [whoami]
    })

    await this.setIndex({
      created: nowTime
    })


    this.readKeychain = null
    this.metaKeychain = null
  }

  /** 
   * Get a file instance
   * @method
   * @param {string} name File path
   * @returns {File}
   */
  async file(name){
    let file = await this.getFile(name)

    if(!file){
      file = new GpgFsFile({
        bucket: this,
        filePath: name
      })
    }

    return file
  }

  async getFileFromCache(id){
    return this._fileCache[id]
  }

  async getFile(path){
    await this.getIndex()

    if(!(this.index && this.index.objects)){
      return null
    }

    path = Path.join('/', path)

    let fileId = null
    for(const obj of this.index.objects){
      if(obj.path == path){
        fileId = obj.objectId.id
        break;
      }
    }
 
    if(!fileId){ return null }

    //! get file from cache
    let file = this._fileCache[fileId]

    if(!file){
      file = new GpgFsFile({
        bucket: this,
        id: fileId,
        filePath: path
      })

      await file.open()
      this._fileCache[file.id] = file
    }

    return file
  }

  get path(){ return '/buckets/bucket-'+this.id.toHexString() }
  get indexPath(){return this.path+'/index' }
  get metadataPath(){return this.path+'/metadata' }
  get readKeyPath(){return this.path+'/keys/read-key' }
  get metaReadKeyPath(){return this.path+'/keys/meta-read-key' }

  async getReciepents(){
    await this.root.cacheWhoami()
    let toList = [ this.root.whoami ]

    if(this.metadata){

      if(this.metadata.meta && this.metadata.meta.length > 0){
        toList = toList.concat(this.metadata.meta)
      }

      if(this.metadata.readers && this.metadata.readers.length > 0){
        toList = toList.concat(this.metadata.readers)
      }

      if(this.metadata.writers && this.metadata.writers.length > 0){
        toList = toList.concat(this.metadata.writers)
      }

    }

    return Utils.uniqueArray(toList)
  }

  async getMetaKeyReciepents(){
    let toList = [ Hoek.reach(this, 'metadata.owner', {default: this.root.whoami}) ]

    if(this.metadata){

      if(this.metadata.meta && this.metadata.meta.length > 0){
        toList = toList.concat(this.metadata.meta)
      }

      if(this.metadata.readers && this.metadata.readers.length > 0){
        toList = toList.concat(this.metadata.readers)
      }

      if(this.metadata.writers && this.metadata.writers.length > 0){
        toList = toList.concat(this.metadata.writers)
      }
    }

    return Utils.uniqueArray(toList)
  }


  async getReadKeyReciepents(){
    let toList = [ Hoek.reach(this, 'metadata.owner', {default: this.root.whoami}) ]

    if(this.metadata){

      if(this.metadata.readers && this.metadata.readers.length > 0){
        toList = toList.concat(this.metadata.readers)
      }

      if(this.metadata.writers && this.metadata.writers.length > 0){
        toList = toList.concat(this.metadata.writers)
      }
    }

    return Utils.uniqueArray(toList)
  }

  async getObjectIds(){
    const objectPaths = (await this.readDir('/objects'))
      .map(item=>{
        return item.replace('object-','')
      })

    debug('found ids', objectPaths)
    return objectPaths
  }



  

  async initReadKeys(){
    if(this.readKeychain !== null){ throw 'refuse to overwrite existing read key' }
    if(this.metaKeychain !== null){ throw 'refuse to overwrite existing metadata key' }

    this.readKeychain = new GpgPromised.KeyChain()
    this.metaKeychain = new GpgPromised.KeyChain()

    await Promise.all([
      await this.readKeychain.open(),
      await this.metaKeychain.open()
    ])
  }

  async createReadKeys(){
    await this.initReadKeys()

    await Promise.all([
      this.readKeychain.generateKey({
        //expire: '2y',
        unattend: true,
        name: `readers ${this.id}`,
        email: `bucket-readers-${this.id}@gpgfs.xyz`
      }),
      this.metaKeychain.generateKey({
        //expire: '2y',
        unattend: true,
        name: `metareaders ${this.id}`,
        email: `bucket-metareaders-${this.id}@gpgfs.xyz`
      })
    ])

    this.keyFingerprints.read = (await this.readKeychain.listSecretKeys())[0].fpr.user_id
    this.keyFingerprints.meta = (await this.metaKeychain.listSecretKeys())[0].fpr.user_id

    this.keyPublics.read = await this.readKeychain.exportPublicKey(`bucket-readers-${this.id}@gpgfs.xyz`)
    this.keyPublics.meta = await this.metaKeychain.exportPublicKey(`bucket-metareaders-${this.id}@gpgfs.xyz`)

    await this.saveReadKeys()
  }

  async saveReadKeys(){
    //! store read & metadata keys
    debug('saving bucket keys')
    const saveSecretText = async (keychain, path, to) =>{
      const who = await keychain.whoami()
      const key = await keychain.exportSecretKey(who[0])
      await this.root.writeFile(
        path,
        key,
        { to, encrypt: true }
      )
    }

    await Promise.all([
      saveSecretText(
        this.readKeychain,
        this.readKeyPath,
        await this.getReadKeyReciepents()
      ),
      saveSecretText(
        this.metaKeychain,
        this.metaReadKeyPath,
        await this.getMetaKeyReciepents()
      )
    ])
  }

  async loadReadKeys(){
    debug('loading bucket keys')
    await this.initReadKeys()

    let fromList = [ Hoek.reach(this, 'metadata.owner', {default: this.root.whoami}) ]

    const loadSecretKey = async (keychain, path) =>{
      const key = await this.root.readFile(path, true, null, null, {
        trust: 'direct',
        from: fromList
      })

      const [keyId] = await keychain.importKey(key)

      await keychain.trustKey(keyId, '5')

      const lookups = (this.metadata.writers||[]).map(async writer => {
        debug('\twriter\t',writer)

        const k = await keychain.lookupKey(writer)
        debug(k)
        await keychain.recvKey( k.keyid )
        await keychain.signKey(writer)
      })

      await Promise.all(lookups)

      return await keychain.whoami()
    }

    const whose = await Promise.all([
      loadSecretKey( this.readKeychain, this.readKeyPath ),
      loadSecretKey( this.metaKeychain, this.metaReadKeyPath )
    ])

    this.keyFingerprints.read = (await this.readKeychain.listSecretKeys())[0].fpr.user_id
    this.keyPublics.read = await this.readKeychain.exportPublicKey(whose[0][0])


    this.keyFingerprints.meta = (await this.metaKeychain.listSecretKeys())[0].fpr.user_id
    this.keyPublics.meta = await this.metaKeychain.exportPublicKey(whose[0][1])

    // Assert loaded key fingerprints and publics match listed in project json
    // import & trust read keys if not already in key ring

    //import and trust in root keychain
    debug('import bucket keys', this.keyFingerprints)
    const [[importedReadId], [importedMetaId]] = await Promise.all([
      this.root.keychain.importKey(this.keyPublics.read),
      this.root.keychain.importKey(this.keyPublics.meta)
    ])

    debug('trust keys', importedReadId, importedMetaId)
    await Promise.all([
      this.root.keychain.trustKey( importedReadId, '3' ),
      this.root.keychain.trustKey( importedMetaId, '3' )
    ])
  
  }

  async unloadReadKeys(){
    //! @todo
    throw 'not implemented'
  }


  /**
   * Bucket metadata 
   * @method 
   * @returns {gpgfs_model.bucket_meta} See [`gpgfs_model.bucket_meta`]{@link https://github.com/datapartyjs/gpgfs-model/blob/master/src/types/bucket_meta.js}
   */
  async getMetadata(){
    this.metadata = await this.root.readFile( this.metadataPath, true, 'bucket_meta', null, {from: Hoek.reach(this, 'metadata.owner')})
    return this.metadata
  }

  async setMetadata(value={}){
    const nowTime = (new Date()).toISOString()
    let newMetadata = Object.assign({lastchanged: nowTime}, this.metadata, value)

    await this.root.writeFile( this.metadataPath,
      newMetadata,
      {
        model: 'bucket_meta',
        encrypt: true,
        trust: 'direct',
        to: await this.getReciepents()
      }
    )

    if(!this.metadata){
      debug('creating metadata')
      this.metadata = newMetadata
    }
    else {
      debug('replacing metadata')
      this.metadata = newMetadata
    }

  }

    /**
   * Bucket index 
   * @method 
   * @returns {gpgfs_model.bucket_index} See [`gpgfs_model.bucket_index`]{@link https://github.com/datapartyjs/gpgfs-model/blob/master/src/types/bucket_index.js}
   */
  async getIndex(){
    if(this.index !== null){ return this.index }
    this.index = await this.root.readFile( this.indexPath, true, 'bucket_index', null, {from: Hoek.reach(this, 'metadata.writers')})
    return this.index   
  }

  async setIndex(value){
    const nowTime = (new Date()).toISOString()
    let newIndex = Object.assign({
      lastchanged: nowTime,
      bucketId: {
        id: this.id.toHexString(),
        type: 'bucket_meta'
      },
      objects: [],
      dirs: []
    }, value)


    await this.root.writeFile( this.indexPath,
      newIndex,
      {
        model: 'bucket_index',
        encrypt: true,
        trust: 'direct',
        to: await this.getReciepents()
      }
    )

    if(!this.index){
      debug('creating index')
      this.index = newIndex
    }
    else {
      debug('replacing index')
      this.index = newIndex
    }
  }

  async mkdir(path){
    debug('mkdir path -', path)
    await this.getIndex()

    path = Path.normalize( Path.join('/', path ))

    debug('\t', 'normalize -', path)

    if(this.index.dirs.indexOf(path) < 0){
      this.index.dirs.push(path)
      await this.setIndex({...this.index})
    }
  }

  async rmdir(path){
    debug('rmdir path -', path)
    await this.getIndex()

    path = Path.normalize( Path.join('/', path ))

    debug('\t', 'normalize -', path)

    const idx = this.index.dirs.indexOf(path)
    if(idx > -1){
      this.index.dirs.splice(idx, 1)
      await this.setIndex({...this.index})
    }
  }

  readDir(path){
    // Given a path, determine the objects and dirs local to that path

    debug('readDir ', path)

    const bucketPath = Path.normalize( Path.join('/', path) )

    debug('readDir ', this.name, bucketPath)

    const results = {
      files: {},
      dirs: []
    }

    //! Search objects
    for(const obj of this.index.objects){

      //debug('check file ', obj.path, ' startsWith(', bucketPath, ')')

      if(obj.path.startsWith(bucketPath)){

        const filePathToks = obj.path.replace(bucketPath, '').split('/')
        if(filePathToks[0] == ''){ filePathToks.shift() }
        const localPath = filePathToks[0]

        if(filePathToks.length > 1){
          //! add intermediate directory to list
          results.dirs.push( localPath )
        } else {
          results.files[ localPath ] = obj
        }

      }
    }

    for(let i = 0; i < Hoek.reach(this, 'index.dirs.length', {default: 0}); i++){
      
      const dirPath = this.index.dirs[ i ]
      if(dirPath.startsWith(bucketPath)){

        const filePathToks = dirPath.replace(bucketPath, '').split('/')
        if(filePathToks[0] == ''){ filePathToks.shift() }
        const localPath = filePathToks[0]
        results.dirs.push( localPath )
      }
    }

    results.dirs = Utils.uniqueArray( results.dirs )

    return results
  }

  /** @method
   * @param {File} file
   */
  async indexFile(file){
    let indexes = []

    await this.getIndex()


    for(const idx in Hoek.reach(this, 'index.objects')){
      
      let obj = this.index.objects[ idx ]
      if(obj.path == file.filePath || obj.objectId.id == file.id){
        indexes.push(idx)
      }
    }

    debug('found ', indexes.length, ' index entries matching path =', file.filePath)

    if(indexes.length > 1){ throw new Error('duplicate file path in index') }

    const idx = indexes[0]
    let oldIndex =  Hoek.reach(this, 'index.objects.'+idx)
    let newIndex = {
      created: file.metadata.created,
      objectId: file.metadata.objectId,
      path: file.metadata.path,
      size: file.lastchange.size,
      lastchanged: file.lastchange.lastchanged
    }

    debug('newIndex', newIndex)

    const parents = Utils.parentPaths( newIndex.path )
    
    if(parents && parents.length > 0){
      debug('creating parent dirs', parents)
      const mkParentDirs = parents.map(this.mkdir.bind(this))

      await Promise.all( mkParentDirs )
    }

    if(!oldIndex){

      await this.setIndex({
        ...this.index,
        objects: [].concat(this.index.objects, [newIndex])
      })
    }
    else {

      this.index.objects[ idx ] = newIndex
      await this.setIndex({...this.index })
    }
  }

  async unindexFile(file){
    debug('unindex')
    let indexes = []

    await this.getIndex()


    for(const idx in Hoek.reach(this, 'index.objects')){
      
      let obj = this.index.objects[ idx ]
      if(obj.path == file.filePath || obj.objectId.id == file.id){
        indexes.push(idx)
      }
    }

    debug('found ', indexes.length, ' index entries matching path =', file.filePath)

    if(indexes.length > 1){ throw new Error('duplicate file path in index') }

    const idx = indexes[0]
    let oldIndex =  Hoek.reach(this, 'index.objects.'+idx)

    if(oldIndex){
      debug('removing from index', oldIndex)
      this.index.objects.splice( idx, 1 );

      await this.setIndex({...this.index })
    }
  }

  async isWriter(id=null){
    //! @todo
    return true
  }

  async isOwner(id=null){
    //! @todo
    return true
  }

  async isReader(id=null){
    //! @todo
    return true
  }

  async isWritable({path, file}={}){
    const writer = await this.isWriter()
    const fsWritable = this.root.storage.mode == IStorage.MODE_WRITE

    return writer && fsWritable 
  }

  /**
   * Allow access for list of actors to type level of access
   * @param {Object} options
   * @param {('meta'|'readers'|'writers')} options.type Access type
   * @param {string[]} options.list List of emails or fingerprints
   */
  async addActor({type, list}){
    debug('addActor ', type, list)

    if(!await this.isOwner()){ throw new Error('must be owner to manipulate bucket metadata') }
    
    if(['meta', 'readers', 'writers'].indexOf(type) < 0){
      throw new Error('addActor type invalid ['+type+']')
    }

    const emailFprs = await this.root.keychain.resolveEmails(list)

    const fullList = [].concat( list, emailFprs )

    if(!this.metadata[type]){  this.metadata[type] = [] }

    this.metadata[type] = Utils.uniqueArray( this.metadata[type].concat( fullList ) )

    await this.setMetadata()
  }
}

module.exports = Bucket
