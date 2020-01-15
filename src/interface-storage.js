const debug = require('debug')('gpgfs.interface-storage')

class IStorage {

  constructor(){
    debug('new', this.name)
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