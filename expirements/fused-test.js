const Fused = require('fused');

const f = new Fused()

const defaultMode = {
  owner: {
    read: true,
    write: true,
    execute: false,
  },
  group: {
    read: false,
    write: false,
    execute: false,
  },
  others: {
    read: false,
    write: false,
    execute: false,
  },
};


// these options are much more powerful but more on that later
f.add('/static', {
  type: 'file',
  content: 'some static content',
  mode: defaultMode,
});

let pings = 0;
f.add('/dynamic', {
  type: 'file',
  content(data, cb) {
    // if data is not null, this is a write op
    // callback with data for read ops
    console.log('read op =', !!data)
    if(data){
      console.log('\tdata', data)
      return cb(data)
    }

    if(!data){ pings++ }

    cb(Buffer.from(`Number of pings: ${pings}\n`, 'utf8'));
  },
  mode: defaultMode,
});

f.add('/promise', {
  type: 'file',
  content: async (data) => {
    console.log('promise', !data ? 0 :data.length)
    return Promise.resolve('wow look it works with promises too\n');
  },
  mode: defaultMode,
});


f.mount('./magic').then((d) => console.log('Mounted!',d)).catch(e => {console.log(JSON.stringify(e,null,2))  })
