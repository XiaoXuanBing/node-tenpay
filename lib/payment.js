const urllib = require('urllib');
const util = require('./util');
const FormData = require('form-data');

class Payment {
  constructor({appid, mchid, partnerKey, pfx, APIv3Key, notify_url, refund_url, spbill_create_ip}) {
    if (!appid) throw new Error('appid fail');
    if (!mchid) throw new Error('mchid fail');
    if (!partnerKey) throw new Error('partnerKey fail');

    this.appid = appid;
    this.mchid = mchid;
    this.partnerKey = partnerKey;
    this.pfx = pfx;
    this.APIv3Key = APIv3Key;
    this.notify_url = notify_url;
    this.refund_url = refund_url;
    this.spbill_create_ip = spbill_create_ip || '127.0.0.1';
    this.urls = {
      micropay: 'https://api.mch.weixin.qq.com/pay/micropay',
      reverse: 'https://api.mch.weixin.qq.com/secapi/pay/reverse',
      unifiedOrder: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
      orderQuery: 'https://api.mch.weixin.qq.com/pay/orderquery',
      closeOrder: 'https://api.mch.weixin.qq.com/pay/closeorder',
      refund: 'https://api.mch.weixin.qq.com/secapi/pay/refund',
      refundQuery: 'https://api.mch.weixin.qq.com/pay/refundquery',
      downloadBill: 'https://api.mch.weixin.qq.com/pay/downloadbill',
      downloadFundflow: 'https://api.mch.weixin.qq.com/pay/downloadfundflow',
      sendCoupon: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/send_coupon',
      queryCouponStock: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/query_coupon_stock',
      queryCouponInfo: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/querycouponsinfo',
      transfers: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/promotion/transfers',
      transfersQuery: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/gettransferinfo',
      payBank: 'https://api.mch.weixin.qq.com/mmpaysptrans/pay_bank',
      queryBank: 'https://api.mch.weixin.qq.com/mmpaysptrans/query_bank',
      sendredPack: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/sendredpack',
      sendGroupRedpack: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/sendgroupredpack',
      redpackQuery: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/gethbinfo',
      getPublicKey: 'https://fraud.mch.weixin.qq.com/risk/getpublickey',
      getCert: 'https://api.mch.weixin.qq.com/risk/getcertficates',
      uploadMedia: 'https://api.mch.weixin.qq.com/secapi/mch/uploadmedia',
      microSubmit: 'https://api.mch.weixin.qq.com/applyment/micro/submit',
      microUpdateContact: 'https://api.mch.weixin.qq.com/applyment/micro/modifycontactinfo',
      microUpdateArchive: 'https://api.mch.weixin.qq.com/applyment/micro/modifyarchives',
      microGetState: 'https://api.mch.weixin.qq.com/applyment/micro/getstate',
      microFollow: 'https://api.mch.weixin.qq.com/secapi/mkt/addrecommendconf',
      microBind: 'https://api.mch.weixin.qq.com/secapi/mch/addsubdevconfig',
      microQueryConfig: 'https://api.mch.weixin.qq.com/secapi/mch/querysubdevconfig'
    };

    // 对外暴露方法
    this.encryptRSA = util.encryptRSA;
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

  async _request(params, type, cert = false) {
    // 安全签名
    params.sign = this._getSign(params, params.sign_type);
    // 创建请求参数
    let pkg = {
      method: 'POST',
      data: util.buildXML(params)
    };
    // 添加证书
    if (cert) {
      pkg.pfx = this.pfx;
      pkg.passphrase = this.mchid;
    }

    let url = this.urls[type];
    let {status, data} = await urllib.request(url, pkg);
    if (status !== 200) throw new Error('REQUEST_FAIL');

    const ignoreParse = ['downloadBill', 'downloadFundflow'];
    return ~ignoreParse.indexOf(type) ? data : await util.parseXML(data);
  }

  // 获取JS支付参数(自动下单)
  async getPayParams(params) {
    params.trade_type = 'JSAPI';
    let order = await this.unifiedOrder(params);
    return this.getPayParamsByPrepay(order, params.sign_type);
  }

  // 获取JS支付参数(通过预支付会话标志)
  getPayParamsByPrepay(params, signType) {
    let pkg = {
      appId: params.sub_appid || this.appid,
      timeStamp: util.now(),
      nonceStr: util.generate(),
      package: 'prepay_id=' + params.prepay_id,
      signType: signType || 'MD5'
    };
    pkg.paySign = this._getSign(pkg, signType);
    pkg.timestamp = pkg.timeStamp;

    return pkg;
  }

  // 获取APP支付参数(自动下单)
  async getAppParams(params) {
    params.trade_type = 'APP';
    let order = await this.unifiedOrder(params);
    return this.getAppParamsByPrepay(order, params.sign_type);
  }

  // 获取APP支付参数(通过预支付会话标志)
  getAppParamsByPrepay(params, signType) {
    let pkg = {
      appid: params.sub_appid || this.appid,
      partnerid: params.sub_mch_id || this.mchid,
      prepayid: params.prepay_id,
      package: 'Sign=WXPay',
      noncestr: util.generate(),
      timestamp: util.now()
    };
    pkg.sign = this._getSign(pkg, signType);

    return pkg;
  }

  // 扫码支付, 生成URL(模式一)
  getNativeUrl(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      time_stamp: util.now(),
      nonce_str: util.generate(),
      ...params
    };
    pkg.sign = this._getSign(pkg);

    let url = 'weixin://wxpay/bizpayurl'
            + '?sign=' + pkg.sign
            + '&appid=' + pkg.appid
            + '&mch_id=' + pkg.mch_id
            + '&product_id=' + encodeURIComponent(pkg.product_id)
            + '&time_stamp=' + pkg.time_stamp
            + '&nonce_str=' + pkg.nonce_str;
    return url;
  }

  // 刷卡支付
  micropay(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      spbill_create_ip: this.spbill_create_ip,
      ...params
    };

    return this._request(pkg, 'micropay');
  }

  // 撤销订单
  reverse(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      ...params
    };

    return this._request(pkg, 'reverse', true);
  }

  // 统一下单
  unifiedOrder(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      notify_url: this.notify_url,
      spbill_create_ip: this.spbill_create_ip,
      trade_type: 'JSAPI',
      ...params
    };

    return this._request(pkg, 'unifiedOrder');
  }

  // 订单查询
  orderQuery(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      ...params
    };

    return this._request(pkg, 'orderQuery');
  }

  // 关闭订单
  closeOrder(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      ...params,
    };

    return this._request(pkg, 'closeOrder');
  }

  // 申请退款
  refund(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      op_user_id: this.mchid,
      notify_url: this.refund_url,
      ...params
    };
    if (!pkg.notify_url) delete pkg.notify_url;

    return this._request(pkg, 'refund', true);
  }

  // 查询退款
  refundQuery(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      ...params
    };

    return this._request(pkg, 'refundQuery');
  }

  // 下载对帐单
  downloadBill(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      bill_type: 'ALL',
      ...params
    };

    return this._request(pkg, 'downloadBill');
  }

  // 下载资金帐单
  downloadFundflow(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'HMAC-SHA256',
      account_type: 'Basic',
      ...params
    };

    return this._request(pkg, 'downloadFundflow', true);
  }

  // 发放代金券
  sendCoupon(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      openid_count: 1,
      ...params
    };

    return this._request(pkg, 'sendCoupon', true);
  }

  // 查询代金券批次
  queryCouponStock(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      ...params
    };

    return this._request(pkg, 'queryCouponStock');
  }

  // 查询代金券信息
  queryCouponInfo(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      ...params
    };

    return this._request(pkg, 'queryCouponInfo');
  }

  // 企业付款
  transfers(params) {
    let pkg = {
      mch_appid: this.appid,
      mchid: this.mchid,
      nonce_str: util.generate(),
      check_name: 'FORCE_CHECK',
      spbill_create_ip: this.spbill_create_ip,
      ...params
    };

    return this._request(pkg, 'transfers', true);
  }

  // 查询企业付款
  transfersQuery(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      ...params
    };

    return this._request(pkg, 'transfersQuery', true);
  }

  // 获取RSA公钥(付款到银行卡加密需要)
  getPublicKey(params) {
    let pkg = {
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'MD5',
      ...params
    };
    return this._request(pkg, 'getPublicKey', true);
  }

  // 企业付款到银行卡
  async payBank(params) {
    let pkg = {
      mch_id: this.mchid,
      nonce_str: util.generate(),
      ...params
    };

    return this._request(pkg, 'payBank', true);
  }

  // 查询企业付款到银行卡
  queryBank(params) {
    let pkg = {
      mch_id: this.mchid,
      nonce_str: util.generate(),
      ...params
    };

    return this._request(pkg, 'queryBank', true);
  }

  // 发送普通红包
  sendRedpack(params) {
    let pkg = {
      wxappid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      client_ip: this.spbill_create_ip,
      total_num: 1,
      ...params
    };
    delete pkg.mch_autono;

    return this._request(pkg, 'sendRedpack', true);
  }

  // 发送裂变红包
  sendGroupRedpack(params) {
    let pkg = {
      wxappid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      total_num: 3,
      amt_type: 'ALL_RAND',
      ...params
    };

    return this._request(pkg, 'sendGroupRedpack', true);
  }

  // 查询红包记录
  redpackQuery(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      nonce_str: util.generate(),
      bill_type: 'MCHT',
      ...params
    };

    return this._request(pkg, 'redpackQuery', true);
  }

  // 获取平台证书
  async getCert(raw) {
    let pkg = {
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'HMAC-SHA256'
    };

    let data = await this._request(pkg, 'getCert');
    if (raw) return data;

    let {serial_no, encrypt_certificate} = JSON.parse(data.certificates).data.pop();
    let {nonce, associated_data, ciphertext} = encrypt_certificate;
    let certificate = util.decryptGCM(ciphertext, this.APIv3Key, nonce, associated_data);

    return {serial_no, certificate};
  }

  // 提交小微申请
  microSubmit(params) {
    let pkg = {
      version: '3.0',
      nonce_str: util.generate(),
      mch_id: this.mchid,
      sign_type: 'HMAC-SHA256',
      ...params
    };

    return this._request(pkg, 'microSubmit', true);
  }

  // 修改小微联系人
  microUpdateContact(params) {
    let pkg = {
      version: '1.0',
      nonce_str: util.generate(),
      mch_id: this.mchid,
      sign_type: 'HMAC-SHA256',
      ...params
    };

    return this._request(pkg, 'microUpdateContact', true);
  }

  // 修改小微结算信息
  microUpdateArchive(params) {
    let pkg = {
      version: '1.0',
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'HMAC-SHA256',
      ...params
    };

    return this._request(pkg, 'microUpdateArchive', true);
  }

  // 查询小微申请状态
  microGetState(params) {
    let pkg = {
      version: '1.0',
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'HMAC-SHA256',
      ...params
    };

    return this._request(pkg, 'microGetState', true);
  }

  // 小微商户配置关注
  microFollow(params) {
    let pkg = {
      mch_id: this.mchid,
      nonce_str: util.generate(),
      sign_type: 'HMAC-SHA256',
      ...params
    };

    return this._request(pkg, 'microFollow', true);
  }

  // 小微商户配置appid
  microBind(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      ...params
    };

    return this._request(pkg, 'microBind', true);
  }

  // 小微商户配置查询
  microQueryConfig(params) {
    let pkg = {
      appid: this.appid,
      mch_id: this.mchid,
      ...params
    };

    return this._request(pkg, 'microQueryConfig', true);
  }

  // 图片上传
  async uploadMedia(file, filename = 'image.jpg') {
    let pkg = {
      mch_id: this.mchid,
      media_hash: util.md5(file),
      sign_type: 'HMAC-SHA256'
    };
    pkg.sign = this._getSign(pkg, pkg.sign_type);

    let form = new FormData();
    form.append('media', file, {filename});
    form.append('mch_id', pkg.mch_id);
    form.append('media_hash', pkg.media_hash);
    form.append('sign', pkg.sign);
    form.append('sign_type', pkg.sign_type);

    let {status, data} = await urllib.request(this.urls['uploadMedia'], {
      method: 'POST',
      pfx: this.pfx,
      passphrase: this.mchid,
      headers: form.getHeaders(),
      stream: form
    });

    if (status !== 200) throw new Error('REQUEST_FAIL');

    return await util.parseXML(data);
  }
}

module.exports = config => new Payment(config);
