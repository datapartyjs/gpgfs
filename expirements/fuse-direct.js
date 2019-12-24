var fuse = require('node-fuse-bindings')

var mountPath = './magic'

let fileContent = Buffer.alloc(8192)
fileContent.fill(0x0)
let fileSize = 0

const msg = Buffer.from('hello world\n')
msg.copy(fileContent, 0)
fileSize = msg.length

fuse.mount(mountPath, {
  readdir: function (path, cb) {
    console.log('readdir(%s)', path)
    if (path === '/') return cb(0, ['test'])
    cb(0)
  },
  getattr: function (path, cb) {
    console.log('getattr(%s)', path)
    if (path === '/') {
      cb(0, {
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date(),
        nlink: 1,
        size: 100,
        mode: 16877,
        uid: process.getuid ? process.getuid() : 0,
        gid: process.getgid ? process.getgid() : 0
      })
      return
    }

    if (path === '/test') {
      //const eofIdx = fileContent.indexOf(0x0)
      console.log('getattr(',path,') size=',fileSize)
      cb(0, {
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date(),
        nlink: 1,
        size: fileSize,
        mode: 33188,
        uid: process.getuid ? process.getuid() : 0,
        gid: process.getgid ? process.getgid() : 0
      })
      return
    }

    cb(fuse.ENOENT)
  },
  open: function (path, flags, cb) {
    console.log('open(%s, %d)', path, flags)
    cb(0, 42) // 42 is an fd
  },
  read: function (path, fd, buf, len, pos, cb) {
    console.log('read(%s, %d, %d, %d)', path, fd, len, pos)
    /*var str = fileContent.slice(pos).toString()
    if (!str) return cb(0)
    //buf.write(str)*/

    let readEOF = Math.min(pos+len, fileSize)

    const readSize = Math.max(0, readEOF - pos)
    if(readSize > 0){
      fileContent.copy(buf, 0, pos, readEOF)
    }

    console.log('read',path,' readSize=',readSize)

    return cb(readSize)
  },
  write: function(path, fd, buffer, length, position, cb){
    console.log('writing',path, buffer.slice(position, length), length, position)

    const writeFsSize = position+length
    if( fileContent.length < writeFsSize ){
      console.log('resize buffer -',path, writeFsSize)
      let temp = Buffer.alloc( writeFsSize )
      temp.fill(0x0)

      fileContent.copy(temp, 0, 0, fileContent.length)
      fileContent = temp
      fileSize = writeFsSize
    }

    buffer.copy(fileContent, position, 0, length)
    fileSize = Math.max(writeFsSize,fileSize)
    console.log('wrote',length, ' fileSize=',fileSize)

    cb(length) // we handled all the data
  },
  release: function(path, fd, cb) {
    console.log('release',path,fd)
    cb(0)
  },
  truncate: function(path, size, cb) {
    console.log('truncate',path,size)
    fileSize=size
    cb(0)
  },
  ftruncate: function(path, fd, size, cb) {
    console.log('ftruncate',path,' fd=',fd,' size=',size)
    fileSize=size
    cb(0)
  }
}, function (err) {
  if (err) throw err
  console.log('filesystem mounted on ' + mountPath)
})

process.on('SIGINT', function () {
  fuse.unmount(mountPath, function (err) {
    if (err) {
      console.log('filesystem at ' + mountPath + ' not unmounted', err)
    } else {
      console.log('filesystem at ' + mountPath + ' unmounted')
    }
  })
})
