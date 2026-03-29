import { Schema } from 'koishi';
import { WsClient } from './ws';
import * as QQ from './types';
import { HttpServer } from './http';

type IntentKey = keyof typeof QQ.Intents;

const defaultIntentKeys = [
  'GUILDS',
  'GUILD_MEMBERS',
  'GUILD_MESSAGE_REACTIONS',
  'DIRECT_MESSAGES',
  'OPEN_FORUMS_EVENT',
  'AUDIO_OR_LIVE_CHANNEL_MEMBER',
  'USER_MESSAGE',
  'INTERACTIONS',
  'MESSAGE_AUDIT',
  'AUDIO_ACTION',
  'PUBLIC_GUILD_MESSAGES',
] as const satisfies readonly IntentKey[];

const defaultIntents = defaultIntentKeys.reduce((value, intent) => value | QQ.Intents[intent], 0);

export interface BaseConfig extends QQ.Options
{
  intents?: number;
  retryWhen: number[];
  manualAcknowledge: boolean;
  loggerinfo: boolean;
  autoStreamText: boolean;
  protocol: 'websocket' | 'webhook';
  path?: string;
  gatewayUrl?: string;
}

export type Config = BaseConfig & (HttpServer.Options | WsClient.Options);

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    id: Schema.string().description('机器人ID（AppID）。').required(),
    secret: Schema.string().description('机器人密钥（secret）。').role('secret'),
    type: Schema.union(['public', 'private'] as const).description('机器人类型。').default('private'),
    intents: Schema.bitset(QQ.Intents).description('需要订阅的机器人事件。').default(defaultIntents),
    retryWhen: Schema.array(Number).description('发送消息遇到平台错误码时重试。').default([]),
    protocol: Schema.union(['websocket', 'webhook']).description('选择要使用的协议。').default('websocket'),
  }),
  Schema.union([
    Schema.intersect([
      Schema.object({
        protocol: Schema.const('websocket').required(false),
      }),
      WsClient.Options,
      Schema.object({}),
    ]),
    Schema.intersect([
      Schema.object({
        protocol: Schema.const('webhook').required(false),
      }),
      HttpServer.Options,
      Schema.object({}),
    ]),
  ]),
  Schema.object({
    sandbox: Schema.boolean().description('是否开启沙箱模式。').default(false),
    endpoint: Schema.string().role('link').description('要连接的服务器地址。').default('https://api.sgroup.qq.com/'),
    manualAcknowledge: Schema.boolean().description('手动响应回调消息。').default(false),
    gatewayUrl: Schema.string().role('link').description('覆盖 WebSocket 地址。'),
  }).description('进阶设置'),
  Schema.object({
    autoStreamText: Schema.boolean().description('使用原生 Markdown 流式发送纯文本消息。').default(false),
    loggerinfo: Schema.boolean().default(false).description('调试模式').experimental(),
  }).description('高级设置'),
] as const);
