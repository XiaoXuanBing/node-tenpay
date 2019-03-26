const crypto = require('crypto');
const xml2js = require('xml2js');

exports.now = () => '' + (Date.now() / 1000 |0);

exports.decrypt = (encryptedData, key, iv = '') => {
  let decipher = crypto.createDecipheriv('aes-256-ecb', key, iv);
      decipher.setAutoPadding(true);
  let decoded = decipher.update(encryptedData, 'base64', 'utf8');
      decoded += decipher.final('utf8');
  return decoded;
}
exports.decryptGCM = (cipherText, key, iv, aad) => {
  cipherText = Buffer.from(cipherText, 'base64');
  let authTag = cipherText.slice(cipherText.length - 16);
  let data = cipherText.slice(0, cipherText.length - 16);

  let decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      decipher.setAAD(Buffer.from(aad));
  let decoded = decipher.update(data, null, 'utf8');
      decipher.final();
  return decoded;
}

exports.md5 = (str, encoding = 'utf8') => crypto.createHash('md5').update(str, encoding).digest('hex');
exports.sha256 = (str, key, encoding = 'utf8') => crypto.createHmac('sha256', key).update(str, encoding).digest('hex');
exports.encryptRSA = (str, key, padding = 'RSA_PKCS1_OAEP_PADDING') => crypto.publicEncrypt({key, padding: crypto.constants[padding]}, Buffer.from(str)).toString('base64');

exports.checkXML = str => {
  let reg = /^(<\?xml.*\?>)?(\r?\n)*<xml>(.|\r?\n)*<\/xml>$/i;
  return reg.test(str.trim());
}

exports.toQueryString = (obj) => Object.keys(obj)
  .filter(key => key !== 'sign' && obj[key] !== undefined && obj[key] !== '')
  .sort()
  .map(key => key + '=' + obj[key])
  .join('&');

exports.generate = (length = 16) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let noceStr = '', maxPos = chars.length;
  while (length--) noceStr += chars[Math.random() * maxPos |0];
  return noceStr;
}

exports.buildXML = (obj, rootName = 'xml') => {
  const opt = {xmldec: null, rootName, allowSurrogateChars: true, cdata: true};
  return new xml2js.Builder(opt).buildObject(obj);
}

exports.parseXML = (xml) => new Promise((resolve, reject) => {
  const opt = {trim: true, explicitArray: false, explicitRoot: false};
  xml2js.parseString(xml, opt, (err, res) => err ? reject(new Error('XMLDataError')) : resolve(res || {}));
})
