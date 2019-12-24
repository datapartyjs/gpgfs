const Ajv = require('ajv')
const debug = require('debug')('validator')
const GpgfsSchema = require('gpgfs-model/dist/gpgfs-model.json')

class Validator {
  constructor(){
    this.ajv = new Ajv()
    this.jsonSchemeArr = GpgfsSchema.Api
    this.validators = {}

    for(let schema of this.jsonSchemeArr){
      const v = this.ajv.compile(schema)
      this.validators[schema.title] = v
      debug('compiled', schema.title)
    }
  }


  /*
  * @param {*} type 
  * @param {*} data 
  */
  validate(type, data){
    return new Promise((resolve, reject)=>{

      if(!this.validators[type]){
        debug('WARNING - validate with no such model type[', type, ']')
        return resolve(data)
      }

      let valid = this.validators[type](data)

      if(!valid){
        let errors = this.validators[type].errors
        return reject({error: errors})
      }

      return resolve(data)
    })
  }

}

module.exports = Validator