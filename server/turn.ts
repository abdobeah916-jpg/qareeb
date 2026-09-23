type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export function getIceServers(): IceServerConfig[] {
  const urls = (process.env.TURN_URL ?? "").split(",").map(url => url.trim()).filter(url => /^turns?:/i.test(url));
  const username = (process.env.TURN_USERNAME ?? "").trim();
  const credential = (process.env.TURN_CREDENTIAL ?? "").trim();
  if (!urls.length || !username || !credential) return [];
  return [{ urls, username, credential }];
}
