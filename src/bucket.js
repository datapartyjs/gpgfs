
const ObjectId = require('bson-objectid')
const debug = require('debug')('gpgfs.Bucket')
const Hoek = require('@hapi/hoek')

const GpgFsFile = require('./file')

class Bucket {
  constructor({id, name, root}){
    this.id = new ObjectId(id)
    this.name = name
    this.root = root

    this.index = null
    this.metadata = null
    this._fileCache = {}
    debug('new -', name || id)
  }

  async open(){
    this.index = null
    this.metadata = null
    this._fileCache = {}
    await this.getIndex()
    await this.getMetadata()
    this.name = this.metadata.bucketName
    debug('loaded ', this.name)
  }

  exists(){
    return this.root.fileExists( this.path )
  }

  async create(){
    debug('create -', this.id)

    if(this.exists()){ throw new Error('bucket exists') }

    this.root.touchDir(this.path)
    this.root.touchDir(this.path + '/objects')
    this.root.touchDir(this.path + '/object-meta')
    this.root.touchDir(this.path + '/object-lastchange')

    const nowTime = (new Date()).toISOString()

    const whoami = (await this.root.keychain.whoami())[0]

    await this.setMetadata({
      owner: whoami,
      bucketId: {
        id: this.id.toHexString(),
        type: 'bucket_meta'
      },
      created: nowTime,
      bucketName: this.name,
      cleartext: false,
      meta: [],
      readers: [],
      writers: []
    })

    await this.setIndex({
      created: nowTime
    })
  }

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

  get path(){
    return '/buckets/bucket-'+this.id.toHexString()
  }

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

    return toList
  }

  async getObjectIds(){
    const objectPaths = (await this.readDir('/objects'))
      .map(item=>{
        return item.replace('object-','')
      })

    debug('found ids', objectPaths)
    return objectPaths
  }

  async getIndex(){
    if(this.index !== null){ return this.index }
    const indexPath = this.path + '/index'
    this.index = await this.root.readFile( indexPath, true, 'bucket_index')
    return this.index   
  }

  async getMetadata(){
    const metadataPath = this.path + '/metadata'
    this.metadata = await this.root.readFile( metadataPath, true, 'bucket_meta')
    return this.metadata
  }

  async setMetadata(value){
    const nowTime = (new Date()).toISOString()
    let newMetadata = Object.assign({lastchanged: nowTime}, value)

    await this.root.writeFile( this.path + '/metadata',
      newMetadata,
      {
        model: 'bucket_meta',
        encrypt: true,
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


  async setIndex(value){
    const nowTime = (new Date()).toISOString()
    let newIndex = Object.assign({
      lastchanged: nowTime,
      bucketId: {
        id: this.id.toHexString(),
        type: 'bucket_meta'
      },
      objects: []
    }, value)


    await this.root.writeFile( this.path + '/index',
      newIndex,
      {
        model: 'bucket_index',
        encrypt: true,
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

  async indexFile(file){
    let indexes = []

    await this.getIndex()


    for(const idx in Hoek.reach(this, 'index.objects')){
      console.log(idx)
      
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
}

module.exports = Bucket