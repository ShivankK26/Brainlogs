import base from "@brainlog/eslint-config";

// The CLI's whole job is printing to stdout.
export default [...base, { rules: { "no-console": "off" } }];
