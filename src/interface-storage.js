const debug = require('debug')('gpgfs.interface-storage')

class IStorage {

  constructor({readOnly}){
    this.enabled = true
    this.mode = (readOnly == false) ? IStorage.MODE_WRITE : IStorage.MODE_READ
    
    debug('new', this.name, '  mode=', this.mode)
  }

  async start(){
    debug('start')
    this.enabled = true
  }

  async stop(){
    debug('stop')
    this.enabled = false
  }

  assertEnabled(){
    if(this.enabled !== true){
      throw new Error('storage not enabled')
    }
  }

  get name(){ throw new Error('not implemented') }
  
  async fileExists(path){ throw new Error('not implemented read') }
  async readFile(path){ throw new Error('not implemented read') }
  async writeFile(path, data, options){ throw new Error('not implemented write') }
  async rmFile(path){ throw new Error('not implemented rmFile') }
  async checksumFile(path){ throw new Error('not implemented checksum') }

  async readDir(path){ throw new Error('not implemented readdir') }
  async touchDir(path){ throw new Error('not implemented touchdir') }

  static get MODE_READ(){ return 1 }
  static get MODE_WRITE(){ return 2 }
}

module.exports = IStorage
