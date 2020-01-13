# gpgfs

gpgfs is an encrypted file storage solution utilizing gnupg to implement the gpgfs file system

 * Documentation - [datapartyjs.github.io/gpgfs/](https://datapartyjs.github.io/gpgfs/)
 * NPM - [npmjs.com/package/gpgfs](https://www.npmjs.com/package/gpgfs)
 * Code - [github.com/datapartyjs/gpgfs](https://github.com/datapartyjs/gpgfs)
 * Social - [@datapartyjs](https://twitter.com/datapartyjs)

## Goals

 * Private by default
 * Transport agnostic
 * Represent file buckets
 * Encrypted metadata
 * Granular permissions

## API Example

```js
const gpgfs = require('gpgfs')


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

  const file = await bucket.file('directory-1/foo/bar/file-test.txt')

  if(!file.exists()){
    console.log('creating file', file.id)
    await file.create()

    file.content = 'hello world\n'
    await file.save()
  }

  const content = await file.read()
  const metadata = await file.getMetadata()
  const lastchange = await file.getLastchange()

  console.log('file-content [', content, ']')
  console.log('metadata', metadata)
  console.log('lastchange', lastchange)
}
```


## Filesystem `.gpgfs`

Bucket content is stored in the `.gpgfs` directory, locatable anywhere on a host file system. All files are encrypted as PGP armored output

```console
.gpgfs/
└── buckets/
    └── bucket-5e193906a536b1515fcd427d/
        ├── index
        ├── metadata
        ├── object-lastchange/
        │   └── object-5e193908a536b1515fcd427e-lastchange
        ├── object-meta/
        │   └── object-5e193908a536b1515fcd427e-meta
        └── objects/
            └── object-5e193908a536b1515fcd427e
```
