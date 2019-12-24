
const ObjectId = require('bson-objectid')
const debug = require('debug')('gpgfs.Bucket')

class Bucket {
  constructor({id, name, root}){
    this.id = new ObjectId(id)
    this.name = name
    this.root = root

    this.metadata = null
    debug('new -', name || id)
  }

  async open(){
    await this.getMetadata()
    this.name = this.metadata.bucketName
    debug('loaded ', this.name)
  }

  exists(){
    return this.root.fileExists( this.path )    
  }

  async create(){
    //this.id = new ObjectId()
    debug('create -', this.id)
    this.root.touchDir(this.path)

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
  }

  async file(name){
    //
    
  }

  async getFiles({directory}){
    //
  }

  get path(){
    return '/buckets/bucket-'+this.id.toHexString()
  }

  async getMetadata(){
    const rawData = await this.root.readFile( this.path + '/metadata' )
    
    const metadata = JSON.parse(await this.root.keychain.decrypt(rawData))

    this.metadata = await this.root.validateModel('bucket_meta', metadata)
    return this.metadata
  }

  async setMetadata(value){
    const nowTime = (new Date()).toISOString()
    let valWithTime = Object.assign({lastchanged: nowTime}, value)
    const validated = await this.root.validateModel('bucket_meta',valWithTime)

    if(!this.metadata){
      debug('creating metadata')
      this.metadata = validated
    }
    else {
      debug('replacing metadata')
      this.metadata = validated
    }

    const whoami = (await this.root.keychain.whoami())[0]
    let toList = [ whoami ]

    if(this.metadata.meta && this.metadata.meta.length > 0){
      toList = toList.concat(this.metadata.meta)
    }

    if(this.metadata.readers && this.metadata.readers.length > 0){
      toList = toList.concat(this.metadata.readers)
    }

    if(this.metadata.writers && this.metadata.writers.length > 0){
      toList = toList.concat(this.metadata.writers)
    }

    const secureText = await this.root.keychain.encrypt(
      JSON.stringify(this.metadata,null,2),
      toList,
      whoami
    )

    await this.root.writeFile( this.path + '/metadata', secureText )
  }
}

module.exports = Bucket