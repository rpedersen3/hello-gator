import { createPublicClient, toHex, http, Hex } from "viem";
import { randomBytes } from "crypto";
import { optimism } from "viem/chains";


import {
  createBundlerClient,
  createPaymasterClient,
} from "viem/account-abstraction";

import { createPimlicoClient } from "permissionless/clients/pimlico";


export const BUNDLER_URL = process.env.NEXT_PUBLIC_BUNDLER_URL!;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;
export const PAYMASTER_POLICY_ID = process.env.NEXT_PUBLIC_PAYMASTER_POLICY_ID;

export const createSalt = () => toHex(randomBytes(8));

export const publicClient = createPublicClient({
  chain: optimism,
  transport: http(),
});


// todo: add policyId
export const paymasterClient = createPaymasterClient({
  transport: http(BUNDLER_URL),
});

export const bundlerClient = createBundlerClient({
  transport: http(BUNDLER_URL),
  chain: optimism,
  paymaster: paymasterClient,
  paymasterContext: {
    // at minimum this must be an object; for Biconomy you can use:
    mode:             'SPONSORED',
    calculateGasLimits: true,
    expiryDuration:  300,
  }
});

export const getFeePerGas = async () => {
  // The method for determining fee per gas is dependent on the bundler
  // implementation. For this reason, this is centralised here.
  const pimlicoClient = createPimlicoClient({
    chain: optimism,
    transport: http(BUNDLER_URL),
  });

  const { fast } = await pimlicoClient.getUserOperationGasPrice();

  return fast;
};

// todo: this should be built into the SDK and support non-sepolia chains
export const getExplorerUserOperationLink = (
  chainId: 10,
  userOpHash: Hex
) => `https://jiffyscan.xyz/userOpHash/${userOpHash}?network=optimism`;
