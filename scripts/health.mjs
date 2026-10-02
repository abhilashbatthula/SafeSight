for (const [name, url] of [
  ['app', `http://127.0.0.1:${process.env.PROXY_PORT || 8080}`],
  ['API', `http://127.0.0.1:${process.env.PROXY_PORT || 8080}/api/health`],
]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    console.log(
      name,
      response.status,
      name === 'API' ? await response.json() : '',
    );
    if (!response.ok) process.exitCode = 1;
  } catch (e) {
    console.error(name, e.message);
    process.exitCode = 1;
  }
}
