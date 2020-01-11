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

  console.log(bucket)

  const file = await bucket.file('directory-1/foo/bar/filet-test.txt')

  if(!file.exists()){
    console.log('creating file', file.id)
    await file.create()

    file.content = 'hello world'
    await file.save()
  }

  const content = await file.read()
  const metadata = await file.getMetadata()

  console.log('file-content [', content, ']')
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})


