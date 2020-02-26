const gpgfs = require('../src/index')

async function main(){
  const securefs = new gpgfs()
  await securefs.open()

  console.log('opening bucket')
  const bucket = await securefs.bucket('staging')

  if(!await bucket.exists()){
    console.log('creating bucket')
    await bucket.create()
  }
  
  const fuse = new gpgfs.FuseMount('gpgfs')
  await fuse.start()

  await fuse.addBucket(bucket)
  console.log('mounted')
}


// Run main
main().catch((error) => {
  console.log(error)
  console.error(error.message)
  process.exit()
})
