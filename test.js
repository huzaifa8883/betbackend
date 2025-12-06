const https = require('https');
const axios = require('axios');

const agent = new https.Agent({ rejectUnauthorized: false });

(async () => {
  try {
    const res = await axios.get('https://gold3patti.biz:4000/cricket/allmatches', { httpsAgent: agent });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err.message);
  }
})();
