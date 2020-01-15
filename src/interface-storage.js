class IStorage {
  get name(){ throw new Error('not implemented') }
  
  async readFile(path){ throw new Error('not implemented') }
  async writeFile(path, data){ throw new Error('not implemented') }
  async rmFile(path){ throw new Error('not implemented') }
  async checksumFile(path){ throw new Error('not implemented') }

  async readDir(path){ throw new Error('not implemented') }
  async touchDir(path){ throw new Error('not implemented') }

  static get MODE_READ(){ return 1 }
  static get MODE_WRITE(){ return 2 }
}

module.exports = IStorage