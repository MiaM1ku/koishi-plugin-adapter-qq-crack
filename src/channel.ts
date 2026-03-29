export const PRIVATE_CHANNEL_PREFIX = 'private:';

export function isPrivateChannelId(channelId: string)
{
  return channelId.startsWith(PRIVATE_CHANNEL_PREFIX);
}

export function toPrivateChannelId(userId: string)
{
  return `${PRIVATE_CHANNEL_PREFIX}${userId}`;
}

export function fromPrivateChannelId(channelId: string)
{
  return isPrivateChannelId(channelId)
    ? channelId.slice(PRIVATE_CHANNEL_PREFIX.length)
    : channelId;
}
