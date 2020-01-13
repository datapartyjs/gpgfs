const gpgfs = require('../src/index')

async function main(){
  const securefs = new gpgfs()

  await securefs.open()

  //! Trust user
  await securefs.keychain.trustCard()

  const bucket = await securefs.bucket('staging')

  if(!bucket.exists()){
    console.log('creating bucket')
    await bucket.create()
  }

  /*const file = await bucket.file('directory-1/foo/bar/file-test.txt')
  const content = await file.read()
  const metadata = await file.getMetadata()
  console.log('file-content [', content, ']')*/

  const fuse = new gpgfs.FuseMount('gpgfs')
  await fuse.start()

  await fuse.addBucket(bucket)
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})
