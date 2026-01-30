const { generateKeyPairSync } = require('crypto');
const { spawn } = require('child_process');

console.log("Generating RSA Key Pair...");
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

function setSecret(name, value) {
    return new Promise((resolve, reject) => {
        console.log(`Setting secret ${name}...`);
        const proc = spawn('npx', ['wrangler', 'secret', 'put', name], { 
            stdio: ['pipe', 'inherit', 'inherit'], 
            shell: true 
        });

        proc.stdin.write(value);
        proc.stdin.end();

        proc.on('close', (code) => {
            if (code === 0) {
                console.log(`Successfully set ${name}`);
                resolve();
            } else {
                reject(new Error(`Failed to set ${name}, exit code ${code}`));
            }
        });
    });
}

(async () => {
    try {
        await setSecret('RSA_PRIVATE_KEY', privateKey);
        await setSecret('RSA_PUBLIC_KEY', publicKey);
        
        // Also set the Key ID
        await setSecret('RSA_KEY_ID', 'orka-auth-key-1');

        console.log("\n✅ JWKS Configuration Complete!");
        console.log("\nRSA Public Key (for verification):");
        console.log(publicKey);
    } catch (err) {
        console.error("Error setting secrets:", err);
        process.exit(1);
    }
})();
