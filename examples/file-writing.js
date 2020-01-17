const gpgfs = require('../src/index')


async function main(){
  const securefs = new gpgfs({keychan: '/home/alanm/.gnupg'})

  await securefs.open()

  //! Trust user
  //await securefs.keychain.trustCard()

  const bucket = await securefs.bucket('staging')

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

    //file.content = 
    await file.save( Buffer.from('hello world\n') )
  }

  const content = await file.read()
  const metadata = await file.getMetadata()

  console.log('file-content [', content.toString(), ']')
  console.log('metadata', metadata)
  console.log('lastchange', await file.getLastchange())
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})


