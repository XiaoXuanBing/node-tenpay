const util = require('./util');

class Middleware {
  constructor({appid, mchid, partnerKey}) {
    if (!appid) throw new Error('appid fail');
    if (!mchid) throw new Error('mchid fail');
    if (!partnerKey) throw new Error('partnerKey fail');

    this.appid = appid;
    this.mchid = mchid;
    this.partnerKey = partnerKey;
    this.refundKey = util.md5(partnerKey).toLowerCase();
  }

  _getSign(params, type = 'MD5') {
    let str = util.toQueryString(params) + '&key=' + this.partnerKey;
    switch (type) {
      case 'MD5':
        return util.md5(str).toUpperCase();
      case 'HMAC-SHA256':
        return util.sha256(str, this.partnerKey).toUpperCase();
      default:
        throw new Error('signType Error');
    }
  }

  _replyNative(res, prepay_id, err_code_des) {
    let pkg = {
      return_code: 'SUCCESS',
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      result_code: 'SUCCESS',
      prepay_id
    };

    if (err_code_des) {
      pkg.result_code = 'FAIL';
      pkg.err_code_des = err_code_des;
    }

    pkg.sign = this._getSign(pkg);

    let data = util.buildXML(pkg);
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(data);
  }


  _reply(res, return_msg) {
    let pkg = return_msg ? {return_code: 'FAIL', return_msg} : {return_code: 'SUCCESS'};
    let data = util.buildXML(pkg);
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(data);
  }

  async pay(req, res, next) {
    res.reply = msg => this._reply(res, msg);

    try {
      let json = await util.parseXML(req.body);
      // 判断数据有效性
      if (json.return_code !== 'SUCCESS') throw new Error(json.return_msg);
      if (json.result_code !== 'SUCCESS') throw new Error(json.err_code);
      if (json.sign !== this._getSign(json, json.sign_type)) throw new Error('INVALID_SIGN');
      // 创建数据引用
      req.weixin = json;
    } catch (err) {
      return res.reply(err.message || 'Error');
    }
    next();
  }

  async refund(req, res, next) {
    res.reply = msg => this._reply(res, msg);

    try {
      let json = await util.parseXML(req.body);
      // 判断数据有效性
      if (json.return_code !== 'SUCCESS') throw new Error(json.return_msg);
      // 解密敏感数据
      let info = util.decrypt(json.req_info, this.refundKey);
      json.req_info = await util.parseXML(info);
      // 创建数据引用
      req.weixin = json;
    } catch (err) {
      return res.reply(err.message || 'Error');
    }
    next();
  }

  async native(req, res, next) {
    res.reply = msg => this._reply(res, msg);
    res.replyNative = (prepay_id, err_code_des) => this._replyNative(res, prepay_id, err_code_des);

    try {
      let json = await util.parseXML(req.body);
      // 判断数据有效性
      if (json.sign !== this._getSign(json, json.sign_type)) throw new Error('INVALID_SIGN');
      // 创建数据引用
      req.weixin = json;
    } catch (err) {
      return res.reply(err.message || 'Error');
    }
    next();
  }
}

module.exports = config => new Middleware(config);
