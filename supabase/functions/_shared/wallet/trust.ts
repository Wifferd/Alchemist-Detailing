// Certificates the wallet functions trust as the issuer of the Pass Type ID certificate (plan 4.3 and 4.7). All public.
//
// APPLE_WWDR_G4: Apple's "Worldwide Developer Relations - G4" intermediate. Pass Type ID certificates issued after
// 2022-01-27 chain to it, and every pass carries it next to the signer certificate (Apple's pass-builder does the same).
// EMPTY FOR NOW: apple.com could not be reached from the Phase A build session (Nov 12, 2026), and a copy from a third
// party isn't Apple's. Before Phase C, download https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer on a
// machine that can reach Apple, convert it (openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr-g4.pem), and paste
// the PEM below. Until then no real Apple certificate can be installed: wallet-sync/apple-cert refuses it.
export const APPLE_WWDR_G4 = "";

// PHASE_A_TEST_CA: the throwaway certificate authority of Phase A (Nov 12, 2026), standing in for Apple on the TEST
// project only (config.ts trustTestCa). Its private key never left the build session's scratch folder, and it expires
// on Dec 27, 2026. An iPhone refuses passes signed this way; they exist only for tools/wallet/check_pkpass.sh.
export const PHASE_A_TEST_CA = `-----BEGIN CERTIFICATE-----
MIIDtzCCAp+gAwIBAgIUWH9Jo5+9+O7MYu7Fg8addgMsF6swDQYJKoZIhvcNAQEL
BQAwYzE4MDYGA1UEAwwvQWxjaGVtaXN0IFBoYXNlIEEgVGhyb3dhd2F5IFRlc3Qg
Q0EgKG5vdCBBcHBsZSkxGjAYBgNVBAoMEVBoYXNlIEEgdGVzdCBvbmx5MQswCQYD
VQQGEwJVUzAeFw0yNjExMTIxNTAyNDJaFw0yNjEyMjcxNTAyNDJaMGMxODA2BgNV
BAMML0FsY2hlbWlzdCBQaGFzZSBBIFRocm93YXdheSBUZXN0IENBIChub3QgQXBw
bGUpMRowGAYDVQQKDBFQaGFzZSBBIHRlc3Qgb25seTELMAkGA1UEBhMCVVMwggEi
MA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDBEqHh9vcbp2W9FCkRJVz1MYGr
9vEI7w3BM3FoyED/nmAiVq09i3xsbUPY6lsLTeT6UZ6FNXafU4Eqss1jkEJHzXiK
+TJPIEQ1aDYDuhOpnzT4haY+jjnHAjYEFPW4ZYO3UJft/gVP9EfqXtWqtDB6DibF
nkojg9YeqNtFXebgo25n0VfwhofjFK2KNviAfq6WK0o4ZyjNBythmKfsVDarydPU
D6MF8PkgKoibTdNPIIszBGrAKL1qNW+DO4u5K2daw+HPxXno/Fw9gn8LeTKSgwxC
69ctIfc4Xz3028JOT5xocwiP3P1AFQwKBFAUm2/TcePdsq8UZju+hzM2peXjAgMB
AAGjYzBhMB0GA1UdDgQWBBQ0SCrV7Ymx9y6klteo9xokl1kFLTAfBgNVHSMEGDAW
gBQ0SCrV7Ymx9y6klteo9xokl1kFLTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB
/wQEAwIBBjANBgkqhkiG9w0BAQsFAAOCAQEAhN7lxJIhHdXMCTMkOCVcQY+YqgnJ
70val4nzwAJ+EwVSvw19xjiS12iYG9HVnv7bAgJIRvMjkKIIJ9J2ZcBvYpmNaVl2
SDiJYiuOzP72Eqqe8QfOdl90Ca/3jdXizVGrN9eMf5tEvv9X54KQeq1FNR4fHAK0
oQMBPiTGAJnFt5kmrtMtNyJDXiktsrWykvht7nT+ShhFtG218wnjo4w7oGGjBlo/
68fljHdkRjNxdWS7dIK+SrPPCFZ299+kyExORNYpMt+G2tcK7KeJYhGKmmxjCg4G
D92m2gyAbHKiLYM1f4qL62sSt9XV1auPMdyrQA4/5OTS8u7OuwgH98l4hQ==
-----END CERTIFICATE-----
`;
