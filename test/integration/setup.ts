// Suppress pg pool errors fired when testcontainers terminates the database
process.on('uncaughtException', (err: Error) => {
  if (
    /terminating connection due to administrator command|Connection terminated|connect ECONNREFUSED/.test(
      err.message,
    )
  ) {
    return;
  }
  throw err;
});
