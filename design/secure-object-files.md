
## File System Layout

 - gpgfs
  - buckets
    - meta
    - index
    - objects
    - object-meta

## Config

```
{
  {
    host,
    identity
  }
}
```


## Files

### `/gpgfs/buckets/bucket-${bucketId}/meta`

```
{
  owner: string,          //! Key used by owner who can read **ALL** bucket objects
  bucketId: String(uuid),
  created: Date,
  bucketName: string,
  cleartext: Boolean,
  meta: [String],         //! Keys used by metadata services who can read **ALL** object metadata
  readers: [ String ],    //! Keys used by users who can read **ALL** bucket-index and objects
  writers: [ String ],    //! Keys used by users who can write **ALL** bucket-index objects
}
```

### `/gpgfs/buckets/bucket-${bucketId}/index`

```
{
  objects: [ {
    id: String(uuid),
    path: String,
    size: number,
    lastchanged: Date,
  } ]
}
```


### `/gpgfs/buckets/bucket-${bucketId}/object-meta/object-${objectId}-meta`

```
{
  owner: string,
  bucketId: String(uuid),
  objectId: String(uuid),
  created: Date,
  path: string,
  cleartext: Boolean,
  acl: {
    meta: [String],
    readers: [ String ],
    writers: [ String ],
  }
}
```

### `/gpgfs/buckets/bucket-${bucketId}/object-meta/object-${objectId}-lastchange`

```
{
  actor: String,
  changed: Date,
  size: number,
  md5sum: String(md5sum)
}
```



### `/gpgfs/buckets/bucket-${bucketId}/objects/object-${objectId}`

Anything GPG can decrypt

```
BINARY CONTENT
```
