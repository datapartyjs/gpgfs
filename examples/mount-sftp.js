 
const os = require('os')
const gpgfs = require('../src/index')
const SFTPStorage = gpgfs.StorageEngine.SFTPStorage

async function main(){
  
  const sftpStorage = new SFTPStorage({
    host: process.argv[2],
    port: 22,
    user: os.userInfo().username,
    path: os.userInfo().homedir + '/.gpgfs'
  })
  
  await sftpStorage.start()
  
  const remote = new gpgfs({storage: sftpStorage})

  await remote.open()

  //! Trust user
  await remote.keychain.trustCard()

  const bucket = await remote.bucket('vault')

  if(!await bucket.exists()){
    console.log('creating bucket')
    await bucket.create()
  }

  console.log(bucket)

  console.log('bucket-index', bucket.index)

  const file = await bucket.file('directory-1/foo/bar/file-test.txt')

  if(!await file.exists()){
    console.log('creating file', file.id)
    await file.create()

    file.content = 'hello world\n'
    await file.save()
  }

  const content = await file.read()
  const metadata = await file.getMetadata()

  console.log('file-content [', content, ']')
  console.log('metadata', metadata)
  console.log('lastchange', await file.getLastchange())

  const fuse = new gpgfs.FuseMount('gpgfs-sftp')
  await fuse.start()

  await fuse.addBucket(bucket)
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})
