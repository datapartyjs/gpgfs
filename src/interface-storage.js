const debug = require('debug')('gpgfs.interface-storage')


/**
   * Storage interface
   * @interface
   */
class IStorage {

  /*
   * @constructor
   * @param {Object} options
   * @param {boolean} options.readOnly          Storage open mode
   */
  constructor({readOnly}){
    this.enabled = true
    this.mode = (readOnly == false) ? IStorage.MODE_WRITE : IStorage.MODE_READ
    
    debug('new', this.name, '  mode=', this.mode)
  }

  /** Start storage  @method */
  async start(){
    debug('start')
    this.enabled = true
  }

  /** Start stop storage  @method */
  async stop(){
    debug('stop')
    this.enabled = false
  }

  /** Assert if storage intstance is enabled  @method */
  assertEnabled(){
    if(this.enabled !== true){
      throw new Error('storage not enabled')
    }
  }

  /** Storage implementation name @method   */
  get name(){ throw new Error('not implemented') }
  
  /** Check file existance @method   */
  async fileExists(path){ throw new Error('not implemented read') }
  
  /**   @method */
  async readFile(path){ throw new Error('not implemented read') }
  
  /**   @method */
  async writeFile(path, data, options){ throw new Error('not implemented write') }
  
  /**   @method */
  async rmFile(path){ throw new Error('not implemented rmFile') }
  
  /**   @method */
  async checksumFile(path){ throw new Error('not implemented checksum') }

  /**   @method */
  async readDir(path){ throw new Error('not implemented readdir') }
  
  /**   @method */
  async touchDir(path){ throw new Error('not implemented touchdir') }

  static get MODE_READ(){ return 1 }
  static get MODE_WRITE(){ return 2 }
}

module.exports = IStorage
