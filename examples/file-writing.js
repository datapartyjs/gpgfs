const gpgfs = require('../src/index')


async function main(){
  const securefs = new gpgfs()

  await securefs.open()

  //! Trust user
  //await securefs.keychain.trustCard()

  const bucket = await securefs.bucket('staging')

  if(!await bucket.exists()){
    console.log('creating bucket')
    await bucket.create()
  }

  const file = await bucket.file('directory-1/foo/bar/file-test.txt')

  if(!await file.exists()){
    console.log('creating file', file.id)
    await file.create()

    //file.content = 
    await file.save( Buffer.from('hello world\n') )
  }


  const [ content, metadata, lastchange ] = await Promise.all([
    file.read(),
    file.getMetadata(),
    file.getLastchange()
  ])

  console.log('metadata', metadata)
  console.log('lastchange', lastchange)
  console.log('file-content [', content.toString(), ']')
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})


