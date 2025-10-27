// Quick test of GF(2^8) arithmetic
const GF256_SIZE = 256;
const LOG_TABLE = new Uint8Array(GF256_SIZE);
const EXP_TABLE = new Uint8Array(GF256_SIZE * 2);

// Initialize tables
let x = 1;
for (let i = 0; i < 255; i++) {
  EXP_TABLE[i] = x;
  EXP_TABLE[i + 255] = x;
  LOG_TABLE[x] = i;
  x = ((x << 1) ^ ((x & 0x80) ? 0x1d : 0)) & 0xFF;
}
LOG_TABLE[0] = 0;

const gfMul = (a, b) => {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
};

const gfDiv = (a, b) => {
  if (b === 0) throw new Error('Division by zero');
  if (a === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + GF256_SIZE - LOG_TABLE[b]];
};

// Test basic operations
console.log('Testing GF(2^8) arithmetic:');
console.log('2 * 3 =', gfMul(2, 3));
console.log('15 / 3 =', gfDiv(15, 3));
console.log('Verify: (15/3) * 3 =', gfMul(gfDiv(15, 3), 3));

// Test Lagrange interpolation
const secret = 42;
const coeff1 = 17;

// Create polynomial f(x) = 42 + 17*x
const y1 = secret ^ gfMul(coeff1, 1);
const y2 = secret ^ gfMul(coeff1, 2);

console.log('\nPolynomial test:');
console.log('f(x) = 42 + 17*x');
console.log('f(1) =', y1);
console.log('f(2) =', y2);

// Lagrange interpolation at x=0 (same logic as shamir.ts)
const shares = [{ x: 1, y: y1 }, { x: 2, y: y2 }];
let lagrangeSecret = 0;

for (let i = 0; i < shares.length; i++) {
  let numerator = 1;
  let denominator = 1;
  
  for (let j = 0; j < shares.length; j++) {
    if (i === j) continue;
    numerator = gfMul(numerator, shares[j].x);
    denominator = gfMul(denominator, shares[i].x ^ shares[j].x);
  }
  
  const lagrangeCoeff = gfDiv(numerator, denominator);
  console.log(`Share ${i}: numerator=${numerator}, denominator=${denominator}, coeff=${lagrangeCoeff}`);
  lagrangeSecret ^= gfMul(shares[i].y, lagrangeCoeff);
}

console.log('Reconstructed secret =', lagrangeSecret);
console.log('Original secret =', secret);
console.log('Match:', lagrangeSecret === secret);
