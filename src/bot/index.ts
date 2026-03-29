import { Bot, Context, HTTP, Universal } from 'koishi';
import { WsClient } from '../ws';
import { QQGuildBot } from './guild';
import { QQMessageEncoder } from '../message';
import { GroupInternal } from '../internal';
import { HttpServer } from '../http';
import { decodeUser } from '../utils';
import * as AdapterConfig from '../config';
import { fromPrivateChannelId, isPrivateChannelId, toPrivateChannelId } from '../channel';

interface GetAppAccessTokenResult
{
  access_token: string;
  expires_in: number;
}

export class QQBot<C extends Context = Context, T extends QQBot.Config = QQBot.Config> extends Bot<C, T>
{
  static MessageEncoder = QQMessageEncoder;
  static inject = {
    required: ['http', 'logger', 'database'],
    optional: ['server'],
  };

  public guildBot: QQGuildBot<C>;

  internal: GroupInternal;
  http: HTTP;

  private _token?: string;
  private _disposeTokenRefresh?: () => void;
  private _warnedLegacyAuth = false;

  constructor(ctx: C, config: T)
  {
    super(ctx, config, 'qq');
    let endpoint = config.endpoint;
    if (config.sandbox)
    {
      endpoint = endpoint.replace(/^(https?:\/\/)/, '$1sandbox.');
    }
    this.http = this.ctx.http.extend({
      endpoint,
      headers: {
        'Authorization': '',
        'X-Union-Appid': this.config.id,
      },
    });

    this.ctx.plugin(QQGuildBot, {
      parent: this,
    });
    this.internal = new GroupInternal(this, () => this.http);
    if (config.protocol === 'websocket')
    {
      this.ctx.plugin(WsClient, this as QQBot<C, QQBot.Config & WsClient.Options>);
    } else
    {
      this.ctx.plugin(HttpServer, this);
    }
  }

  async initialize()
  {
    const user = await this.guildBot.internal.getMe();
    if (!this.user) this.user = decodeUser(user);
    else Object.assign(this.user, decodeUser(user));
  }

  async stop()
  {
    this._disposeTokenRefresh?.();
    if (this.guildBot)
    {
      delete this.ctx.bots[this.guildBot.sid];
    }
    await super.stop();
  }

  private warnLegacyAuth()
  {
    if (this.config.authType !== 'bot' || this._warnedLegacyAuth) return;
    this._warnedLegacyAuth = true;
    this.logger.warn('QQ 官方已禁用固定 Token 鉴权，当前 bot 模式将自动改用 AccessToken。');
  }

  async _ensureAccessToken()
  {
    try
    {
      const result = await this.ctx.http<GetAppAccessTokenResult>('https://bots.qq.com/app/getAppAccessToken', {
        method: 'POST',
        data: {
          appId: this.config.id,
          clientSecret: this.config.secret,
        },
      });
      if (!result.data.access_token)
      {
        this.logger.warn(`POST https://bots.qq.com/app/getAppAccessToken response: %o, trace id: %s`, result.data, result.headers.get('x-tps-trace-id'));
        throw new Error('failed to refresh access token');
      }
      this._token = result.data.access_token;
      this.http.config.headers.Authorization = `QQBot ${this._token}`;
      this._disposeTokenRefresh?.();
      const delay = Math.max(1000, (result.data.expires_in - 40) * 1000);
      this._disposeTokenRefresh = this.ctx.setTimeout(() =>
      {
        void this._ensureAccessToken().catch((error) =>
        {
          this.logger.warn(error);
        });
      }, delay);
    } catch (e)
    {
      if (!this.ctx.http.isError(e) || !e.response) throw e;
      this.logger.warn(`POST https://bots.qq.com/app/getAppAccessToken response: %o, trace id: %s`, e.response.data, e.response.headers.get('x-tps-trace-id'));
      throw e;
    }
  }

  async getAccessToken()
  {
    if (!this._token)
    {
      await this._ensureAccessToken();
    }
    return this._token;
  }

  async prepareRequestAuthorization()
  {
    this.warnLegacyAuth();
    const token = await this.getAccessToken();
    this.http.config.headers.Authorization = `QQBot ${token}`;
  }

  async getWebSocketToken()
  {
    this.warnLegacyAuth();
    return `QQBot ${await this.getAccessToken()}`;
  }

  async getLogin()
  {
    return this.toJSON();
  }

  async createDirectChannel(id: string)
  {
    return { id: toPrivateChannelId(id), type: Universal.Channel.Type.DIRECT };
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void>
  {
    if (isPrivateChannelId(channelId))
    {
      await this.internal.deletePrivateMessage(fromPrivateChannelId(channelId), messageId);
      return;
    }
    try
    {
      await this.internal.deleteMessage(channelId, messageId);
    } catch (e)
    {
      await this.internal.deletePrivateMessage(fromPrivateChannelId(channelId), messageId);
    }
  }
}

export namespace QQBot
{
  export type BaseConfig = AdapterConfig.BaseConfig;

  export type Config = AdapterConfig.Config;

  export const Config = AdapterConfig.Config;
}
