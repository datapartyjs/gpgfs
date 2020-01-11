# gpgfs

gpgfs is an encrypted file storage solution utilizing gnupg to implement the gpgfs file system


## Goals

 * Private by default
 * Transport agnostic
 * Represent file buckets
 * Encrypted metadata
 * Granular permissions

## API Example

```js
const gpgfs = require('gpgfs')
let securefs = new gpgfs()

await securefs.open()
await securefs.keychain.trustCard()  //! Trust user

const bucket = await securefs.bucket('staging')

if(!bucket.exists()){
  console.log('creating bucket')
  await bucket.create()
}

const file = await bucket.file('directory-1/foo/bar/filet-test.txt')

if(!file.exists()){
  console.log('creating file')
  await file.create()
  await file.save('hello world')
}

const content = await file.read()
const metadata = await file.getMetadata()

console.log('file-content [', content, ']')
```




## Filesystem `.gpgfs`

gpgfs stores buckets in a `.gpgfs` file stored anywhere on a host file system.

```console
.gpgfs/
└── buckets/
    └── bucket-5e0482a09f17a420cbd20382/
        ├── index
        ├── metadata
        ├── object-lastchange/
        ├── object-meta/
        └── objects/
```

### Buckets



#### Bucket Index

#### Bucket Metadata

#### Object Meta

#### Objects
