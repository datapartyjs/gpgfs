class File {
  constructor(bucket, path, {meta, readers, writers, cleartext=false}){
    //
  }

  

  exists(){
    //
  }

  async create(){
    if(this.exists()){ throw new Error('file exists') }
    /*
      if exists() throw
      this.save() // save an empty file
    */
  }

  async access(){
    //load & decrypt meta
  }

  async save(content, {meta,empty}){
    /*

      1. encrypt content to file
      2. update meta {md5sum, lastchange.*}
      3. saveMetadata()
      4. 

    */
  }

  async saveMetadata({meta}){

  }

  async getMetadata(){
    /*
     decrypt metadata into

       {
        data, // json parsed & validated
        raw,  // raw decrypted text
        raw_verification, // raw verification data
        verification      // parsed verification data
       }

    */
  }

  async assertIsTrusted(){}

  async assertIsMetaTrusted(){
    /*
      - is the verification signer an owner?
      - is the verficiation signer a writer?
    */
  }
}