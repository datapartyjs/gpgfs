const Path = require('path')
//const Fuse = require('node-fuse-bindings')
const Fuse = require('fuse-native')

const Mode = require('./file-mode')

const Debug = require('debug')
const debug = Debug('gpgfs.fuse-mount')
const debug_readdir = Debug('gpgfs.fuse-mount.readdir')
const debug_getattr = Debug('gpgfs.fuse-mount.getattr')

const Utils = require('./utils')

class FuseMount {
  constructor(mountPoint){
    this.fdCount = 0
    this.fds = {}
    this.buckets = {}
    this.contentCacheMs = 60000
    this.mountPoint = mountPoint
    this._releasing = {}
    this.fuse = new Fuse(
      this.mountPoint,
      {
        readdir: this.onreaddir.bind(this),
        getattr: this.ongetattr.bind(this),
        open: this.onopen.bind(this),
        read: this.onread.bind(this),
        write: this.onwrite.bind(this),
        fsync: this.onfsync.bind(this),
        unlink: this.onunlink.bind(this),
        create: this.oncreate.bind(this),
        release: this.onrelease.bind(this),
        truncate: this.ontruncate.bind(this),
        ftruncate: this.onftruncate.bind(this),
        mkdir: this.onmkdir.bind(this)
      },
      {debug: false}
    )
    
  }

  async start(){
    debug('start')
    await Utils.touchDir(this.mountPoint)
    await this.mount()
  }

  async addBucket(bucket){
    debug('addBucket', bucket.id, bucket.name)
    this.buckets[bucket.name] = bucket
  }

  isRoot(path){
    if (path === '/') {
      return true
    }

    return false
  }

  getBucket(path){
    const [empty, bucketName, ...dir] = path.split('/')

    return this.buckets[bucketName]
  }

  async mount(){
    debug('mounting -', this.mountPoint)
    const mountPromise = new Promise((resolve, reject)=>{
      this.fuse.mount(
        (err)=>{
          if(err){
            debug('mount error -', this.mountPoint, err)
            return reject(err)
          }
          debug('mounted -', this.mountPoint)

          process.on('exit', this.unmount.bind(this))
          process.on('SIGINT', this.unmount.bind(this))
          process.on('SIGUSR1', this.unmount.bind(this))
          process.on('SIGUSR2', this.unmount.bind(this))
          //process.on('uncaughtException', this.unmount.bind(this))

          resolve()
        }
      )
    })

    return await mountPromise
  }

  async unmount(){
    debug('unmounting -', this.mountPoint)
    const unmountPromise = new Promise((resolve, reject)=>{
      this.fuse.unmount(err=>{
        if(err){
          debug('unmount error -', this.mountPoint, err)
          return reject(err)
        }

        debug('unmounted -', this.mountPoint)
        resolve()
      })
    })

    return await unmountPromise
  }

  async onreaddir(path, cb){
    debug_readdir('onreaddir', path)
    if (this.isRoot(path)) {
      //! Bucket listing

      const bucketNames = Object.keys(this.buckets)
      return cb(0, 
        bucketNames,
        bucketNames.map((name)=>{
          const bucket = this.buckets[name]
          return this.getBucketAttr(bucket)
        })
      )
    }

    const [empty, bucketName, ...dir] = path.split('/')

    debug_readdir('bucketName', bucketName)
    debug_readdir('dir', dir)

    const bucket = this.buckets[bucketName]

    if(!bucket){
      debug_readdir('bucket not mounted -', bucketName)
      cb(Fuse.ENOENT)
      return
    }

    debug_readdir('readdir bucket', bucket.name)
    const {fileNames, fileAttrs} = await this.readBucketDir(bucket, dir)

    if(fileNames.length > 0){
      return cb(0, fileNames, fileAttrs)
    }

    debug_readdir('no content', dir)

    cb(Fuse.ENOENT)
  }

  async ongetattr(path, cb){
    debug_getattr('ongetattr', path)
    if (path === '/') {
      cb(0, {
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date(),
        nlink: 1,
        size: 100,
        mode: new Mode({type:'dir', owner: { read: true, execute: true, write: false}}), //16877,
        uid: process.getuid ? process.getuid() : 0,
        gid: process.getgid ? process.getgid() : 0
      })
      return
    }

    const [empty, bucketName, ...dir] = path.split('/')

    debug_getattr('bucketName', bucketName)
    debug_getattr('dir', dir)

    const bucket = this.buckets[bucketName]

    if(!bucket){
      debug_getattr('bucket not mounted -', bucketName)
      cb(Fuse.ENOENT)
      return
    }

    if(!dir || dir.length < 1){
      //! Bucket attr
      
      cb(0, this.getBucketAttr(bucket))

      return
    }

    const localPath = dir.pop() 

    debug_getattr('getattr', 'dir', dir)
    debug_getattr('getattr', 'localPath', localPath)

    const {fileNames, fileAttrs} = await this.readBucketDir(bucket, dir)

    debug_getattr('getattr', 'fileNames', fileNames)
    debug_getattr('getattr', 'fileAttrs', fileAttrs)

    const dirIdx = fileNames.indexOf(localPath)

    debug_getattr('getattr', 'dirIdx', dirIdx)

    if(dirIdx > -1){
      return cb(0, fileAttrs[dirIdx])
    }


    cb(Fuse.ENOENT)
  }

  async onopen(path, flags, cb){
    debug('onopen', path, flags)

    if(!path || path.length < 1){
      debug('NO PATH?')
      return cb(Fuse.ENOENT)
    }

    const fd = this.fdCount++
    this.fds[fd] = {
      fd,
      path,
      flags
    }

    debug('onopen new FD - ',this.fds[fd])

    const [empty, bucketName, ...dir] = path.split('/')

    debug('onopen', 'bucketName', bucketName, dir)
    const bucket = this.buckets[bucketName]

    const file = await bucket.file(dir.join('/'))

    if(file.content && file.lastchange && file.content.length == file.lastchange.size){
      debug('onopen', 'bucketName', bucketName, dir, 'already read')
    } else {
      debug('onopen', 'bucketName', bucketName, dir, 'reading . . . ')
      
      if(!file.lastchange || !file.metadata){
        await file.open()
        
        await Promise.all([
          await file.getMetadata(),
          await file.getLastchange()
        ])
      }

      await file.read()
    }

    process.nextTick(cb, 0, fd)
  }

  async oncreate(path, mode, cb){
    debug('oncreate', path, mode)

    const [empty, bucketName, ...dir] = path.split('/')

    debug('oncreate', 'bucketName', bucketName, dir)
    const bucket = this.buckets[bucketName]

    const file = await bucket.file(dir.join('/'))

    if(!await file.exists()){ await file.create() }

    const fd = this.fdCount++
    this.fds[fd] = {
      fd,
      path
    }


    return process.nextTick(cb, 0, fd)
  }

  async onunlink(path, cb){
    debug('onunlink', path)

    const [empty, bucketName, ...dir] = path.split('/')

    debug('onunlink', 'bucketName', bucketName, dir)
    const bucket = this.buckets[bucketName]

    try{
    const file = await bucket.file(dir.join('/'))

    if(await file.exists()){ await file.delete() }
    }
    catch(err){
      debug(err)
      throw err
    }

    return process.nextTick(cb,0)
  }

  async onread(path, fd, buf, len, pos, cb){
    debug('onread', path)

    const [empty, bucketName, ...dir] = path.split('/')

    debug('onread', 'bucketName', bucketName, dir)
    const bucket = this.buckets[bucketName]

    const file = await bucket.file(dir.join('/'))

    const writeBuffer = this.fds[fd].writeBuffer
    if(writeBuffer){
      //! User is reading their changed content
      let readEOF = Math.min(pos+len, writeBuffer.size)

      const readSize = Math.max(0, readEOF - pos)
      if(readSize > 0){
        writeBuffer.data.copy(buf, 0, pos, readEOF)
      }
  
      debug('read writeBuffer',path,' readSize=',readSize)
      return process.nextTick(cb, readSize)
    }

    if(!file.content || file.content.length < 1){ 
      debug('onread no file content')
      return process.nextTick(cb, 0)
    }

    let sliced = file.content.slice(pos)

    if(!sliced){ 
      debug('onread no sliced')
      return process.nextTick(cb, 0)
    }

    if(sliced.length > len){ sliced = sliced.slice(0, len) }

    //buf.write(sliced)
    if(typeof sliced == 'string'){
      debug('string')
      buf.write(sliced)
    } else {
      debug('buffer')
      sliced.copy(buf)
    }

    //return cb(sliced.length)
    return process.nextTick(cb, sliced.length)
  }

  async onwrite(path, fd, buf, len, pos, cb){
    debug('onwrite', path, 'fd', fd, 'len', len, 'pos', pos, typeof buf, buf instanceof Buffer)

    let writeBuffer = this.fds[fd].writeBuffer

    if(!writeBuffer){
      this.fds[fd].writeBuffer = {
        size: 0,
        data: Buffer.alloc(8192)
      }

      this.fds[fd].writeBuffer.data.fill(0x0)

      writeBuffer = this.fds[fd].writeBuffer
    }

    let subBuf = buf

    if(buf.length > len){
      debug('BIG BUFFER')
      subBuf = buf.slice(0, len)
    }

    const [empty, bucketName, ...dir] = path.split('/')
    const bucket = this.buckets[bucketName]
    const file = await bucket.file(dir.join('/'))

    debug('writing',path, buf.slice(0, len), len, pos)

    const writeFsSize = pos+len
    if( writeBuffer.data.length < writeFsSize ){
      

      const blockSize = (10*1024*1024)
      const newSize = ((Math.min(1, Math.round(writeFsSize / blockSize)) + 1) * blockSize * 2) + writeFsSize

      debug('resize buffer -',path, writeFsSize, newSize)

      let temp = Buffer.alloc( newSize )
      temp.fill(0x0)

      writeBuffer.data.copy(temp, 0, 0)
      writeBuffer.data = temp
      writeBuffer.size = writeFsSize
    }

    subBuf.copy(writeBuffer.data, pos, 0, len)
    writeBuffer.size = writeFsSize //Math.max(writeFsSize,writeBuffer.size)
    debug('wrote',len, ' fileSize=',writeBuffer.size)

    //cb(len) // we handled all the data
    return process.nextTick(cb, len)
  }

  async onfsync(path, fd, datasync, cb){
    debug('onfsync', path, fd)

    /*const writeBuffer = this.fds[fd].writeBuffer

    if(writeBuffer){
      debug('flushing writeBuffer')

      const [empty, bucketName, ...dir] = path.split('/')
      const bucket = this.buckets[bucketName]
      const file = await bucket.file(dir.join('/'))

      await file.save(writeBuffer.data.slice(0, writeBuffer.size))
      delete this.fds[fd].writeBuffer
      this.fds[fd].writeBuffer = undefined
    }*/

    cb(0)
  }

  async onrelease(path, fd, cb){
    debug('onrelease', path)

    const writeBuffer = this.fds[fd].writeBuffer

    if(writeBuffer){
      debug('flushing writeBuffer ', 
      writeBuffer.size, writeBuffer.data.length, 
      writeBuffer.data.slice(0, writeBuffer.size).length, 
      writeBuffer.data.slice(0, writeBuffer.size).toString().length)


      const [empty, bucketName, ...dir] = path.split('/')
      const bucket = this.buckets[bucketName]
      const file = await bucket.file(dir.join('/'))

      await file.save(writeBuffer.data.slice(0, writeBuffer.size))
      delete this.fds[fd].writeBuffer
      this.fds[fd].writeBuffer = undefined
    }


    delete this.fds[fd]


    if(this._releasing[path]){
      clearTimeout(this._releasing[path])
      debug('delay')
    }

    this._releasing[path] = setTimeout(async ()=>{
      

      debug('releaseTimer -', path)

      let uses = 0
      debug(this.fds)
      for(const id in this.fds){
        const otherFd = this.fds[id]

        debug(id, otherFd)

        if(path == otherFd.path){ uses++ }
      }

      if(uses < 1){
        
        const [empty, bucketName, ...dir] = path.split('/')
        const bucket = this.buckets[bucketName]
        const file = await bucket.file(dir.join('/'))

        if(file.content && file.content.length > 0){
          await file.release()
        }
      }

      delete this._releasing[path]

    }, this.contentCacheMs)


    process.nextTick(cb,0)
  }

  async ontruncate(path, size, cb){
    debug('ontruncate', path, size)

    //const writeBuffer = this.fds[fd].writeBuffer
    //if(writeBuffer){ writeBuffer.size = size }

    cb(0)
  }

  async onftruncate(path, fd, size, cb){
    debug('onftruncate', path, size)

    //const writeBuffer = this.fds[fd].writeBuffer
    //if(writeBuffer){ writeBuffer.size = size }

    cb(0)
  }

  async onmkdir(path, mode, cb){
    debug('mkdir', path, mode)

    if(this.isRoot(path)){
      debug('no custom dirs in mount root')
      return cb(Fuse.ENOENT)
    }

    debug('lookup bucket',path)
    const bucket = this.getBucket(path)

    if(!bucket){
      debug('no such bucket', path)
      return cb(Fuse.ENOENT)
    }

    const [empty, bucketName, ...dir] = path.split('/')

    debug('mkdir', dir)

    await bucket.mkdir(dir.join('/'))
    return cb(0)
  }

  async readBucketDir(bucket, dir){

    const dirContents = bucket.readDir( dir.join('/') )
    

    const writeAllowed = await bucket.isWritable()

    const fileNames = [].concat(
      dirContents.dirs,
      Object.keys(dirContents.files)
    )

    const fileAttrs = [].concat(
      dirContents.dirs.map( dir => {
        return {
          mtime: new Date( bucket.metadata.lastchanged ),
          atime: new Date( bucket.metadata.lastchanged ),
          ctime: new Date( bucket.metadata.created ),
          nlink: 1,
          size: 100,
          mode: new Mode({type:'dir', owner: { read: true, execute: true, write: writeAllowed}}),
          uid: process.getuid ? process.getuid() : 0,
          gid: process.getgid ? process.getgid() : 0
        }
      }),
      Object.values(dirContents.files).map( file => {
        return {
          mtime: new Date( file.lastchanged ),
          atime: new Date( file.lastchanged ),
          ctime: new Date( file.created ),
          nlink: 1,
          size: file.size,
          mode: new Mode({type:'file', owner: { read: true, execute: false, write: writeAllowed}}),
          uid: process.getuid ? process.getuid() : 0,
          gid: process.getgid ? process.getgid() : 0
        }
      })
    )
    
    return {
      fileNames,
      fileAttrs
    }
  }

  getBucketAttr(bucket){
    return {
      mtime: new Date( bucket.metadata.lastchanged ),
      atime: new Date( bucket.metadata.lastchanged ),
      ctime: new Date( bucket.metadata.created ),
      nlink: 1,
      size: 100,
      mode: new Mode({type:'dir', owner: { read: true, execute: true, write: true}}),
      uid: process.getuid ? process.getuid() : 0,
      gid: process.getgid ? process.getgid() : 0
    }
  }
}

module.exports = FuseMount
