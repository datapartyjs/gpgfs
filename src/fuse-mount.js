const Path = require('path')
//const Fuse = require('node-fuse-bindings')
const Fuse = require('fuse-native')

const Mode = require('./file-mode')

const Debug = require('debug')
const debug = Debug('gpgfs.fuse-mount')
debug_readdir = Debug('gpgfs.fuse-mount.readdir')
debug_getattr = Debug('gpgfs.fuse-mount.getattr')

const Utils = require('./utils')

class FuseMount {
  constructor(mountPoint){
    this.buckets = {}
    this.mountPoint = mountPoint
    this.fuse = new Fuse(
      this.mountPoint,
      {
        readdir: this.onreaddir.bind(this),
        getattr: this.ongetattr.bind(this),
        open: this.onopen.bind(this),
        read: this.onread.bind(this),
        write: this.onwrite.bind(this),
        release: this.onrelease.bind(this),
        truncate: this.ontruncate.bind(this),
        ftruncate: this.onftruncate.bind(this)
      },
      {debug: true}
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
          process.on('uncaughtException', this.unmount.bind(this))

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
    if (path === '/') {
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
    const {fileNames, fileAttrs} = this.readBucketDir(bucket, dir)

    if(fileNames.length > 0){
      return cb(0, fileNames, fileAttrs)
    }

    debug_readdir('no content', dir)
    


    cb(0)
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

    const {fileNames, fileAttrs} = this.readBucketDir(bucket, dir)

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
    debug('onopen', path)
    cb(0)
  }

  async onread(path, fd, buf, len, pos, cb){
    debug('onread', path)
    cb(0)
  }

  async onwrite(path, fd, buf, len, pos, cb){
    debug('onwrite', path)
    cb(0)
  }

  async onrelease(path, fd, cb){
    debug('onrelease', path)
    cb(0)
  }

  async ontruncate(path, size, cb){
    debug('ontruncate', path)
    cb(0)
  }

  async onftruncate(path, fd, size, cb){
    debug('onftruncate', path)
    cb(0)
  }

  readBucketDir(bucket, dir){
    const bucketPath = Path.join('/', dir.join('/'))

    debug('readBucketDir ', bucket.name, bucketPath)

    const localPaths = {}

    for(const obj of bucket.index.objects){

      debug('check file ', obj.path, ' startsWith(', bucketPath, ')')

      if(obj.path.startsWith(bucketPath)){

        const filePathToks = obj.path.replace(bucketPath, '').split('/')

        if(filePathToks[0] == ''){ filePathToks.shift() }

        const localPath = filePathToks[0]

        debug('filePathtoks', filePathToks)
        debug('obj.path', obj.path)

        if(!localPaths[localPath]){
          localPaths[localPath] = {
            type: filePathToks.length > 1 ? 'dir' : 'file',
            object: obj,
            lastchanged: new Date(obj.lastchanged)
          }
        }
        else {
          if(Date(obj.lastchanged) > localPaths[localPath].lastchanged){
            localPaths[localPath].obj = obj
            localPaths[localPath].lastchanged = new Date(obj.lastchanged)
          }
        }
      }

    }

    const fileNames = []
    const fileAttrs = []

    const paths = Object.keys(localPaths)
    for(const localPath of paths){
      const info = localPaths[localPath]

      debug('info [', localPath, ']', info)
      
      fileNames.push(localPath)
      fileAttrs.push({
        mtime: new Date( info.object.lastchanged ),
        atime: new Date( info.object.lastchanged ),
        ctime: new Date( info.object.created ),
        nlink: 1,
        size: (info.type == 'dir') ? 100 : info.object.size,
        mode: new Mode({type:info.type, owner: { read: true, execute: (info.type=='dir'), write: true}}),
        uid: process.getuid ? process.getuid() : 0,
        gid: process.getgid ? process.getgid() : 0
      })
    }
    
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