const KEY = 'nps-simulator.encrypted-session.v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedEnvelope = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
};

export type EncryptedProfileFile = {
  format: 'nps-simulator.encrypted-profile';
  version: 1;
  createdAt: string;
  encryption: 'AES-256-GCM/PBKDF2-SHA256';
  payload: EncryptedEnvelope;
};

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptData(
  data: unknown,
  password: string,
): Promise<EncryptedEnvelope> {
  if (password.length < 8) throw new Error('암호는 8자 이상으로 입력하세요.');
  if (!globalThis.crypto?.subtle)
    throw new Error(
      '이 브라우저는 암호화 저장을 지원하지 않습니다. 최신 Edge 또는 Chrome에서 여세요.',
    );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250_000;
  const key = await derive(password, salt, iterations);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data)),
  );
  return {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iterations,
  };
}

export async function decryptData<T>(
  envelope: EncryptedEnvelope,
  password: string,
): Promise<T> {
  try {
    if (
      envelope.version !== 1 ||
      typeof envelope.salt !== 'string' ||
      typeof envelope.iv !== 'string' ||
      typeof envelope.ciphertext !== 'string' ||
      !Number.isFinite(envelope.iterations)
    )
      throw new Error('invalid envelope');
    const salt = fromBase64(envelope.salt);
    const iv = fromBase64(envelope.iv);
    const key = await derive(password, salt, envelope.iterations);
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      fromBase64(envelope.ciphertext),
    );
    return JSON.parse(decoder.decode(clear)) as T;
  } catch {
    throw new Error('암호가 다르거나 저장 데이터가 손상되었습니다.');
  }
}

export async function createEncryptedProfileFile(
  data: unknown,
  password: string,
): Promise<EncryptedProfileFile> {
  return {
    format: 'nps-simulator.encrypted-profile',
    version: 1,
    createdAt: new Date().toISOString(),
    encryption: 'AES-256-GCM/PBKDF2-SHA256',
    payload: await encryptData(data, password),
  };
}

export async function readEncryptedProfileFile<T>(
  value: unknown,
  password: string,
): Promise<T> {
  if (
    !value ||
    typeof value !== 'object' ||
    (value as Partial<EncryptedProfileFile>).format !==
      'nps-simulator.encrypted-profile' ||
    (value as Partial<EncryptedProfileFile>).version !== 1 ||
    !(value as Partial<EncryptedProfileFile>).payload
  )
    throw new Error('부부 연금 종합 시뮬레이터 암호화 JSON 파일이 아닙니다.');
  return decryptData<T>((value as EncryptedProfileFile).payload, password);
}

export async function saveEncryptedSession(data: unknown, password: string) {
  const envelope = await encryptData(data, password);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    throw new Error(
      '브라우저가 로컬 파일의 sessionStorage 사용을 차단했습니다. 최신 Edge 또는 Chrome에서 다시 여세요.',
    );
  }
}

export async function loadEncryptedSession<T>(password: string): Promise<T> {
  let stored: string | null;
  try {
    stored = sessionStorage.getItem(KEY);
  } catch {
    throw new Error(
      '브라우저가 로컬 파일의 sessionStorage 사용을 차단했습니다.',
    );
  }
  if (!stored) throw new Error('이 탭에 저장된 암호화 세션이 없습니다.');
  try {
    return decryptData<T>(JSON.parse(stored) as EncryptedEnvelope, password);
  } catch {
    throw new Error('암호가 다르거나 저장 데이터가 손상되었습니다.');
  }
}

export function hasEncryptedSession() {
  try {
    return (
      typeof window !== 'undefined' && sessionStorage.getItem(KEY) !== null
    );
  } catch {
    return false;
  }
}
export function clearEncryptedSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    throw new Error(
      '브라우저가 로컬 파일의 sessionStorage 사용을 차단했습니다.',
    );
  }
}
