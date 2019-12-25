const gpgfs = require('./src/index')


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
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})


