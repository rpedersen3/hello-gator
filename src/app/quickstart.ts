import {
  type DelegationStruct,
  type ExecutionStruct,
  createCaveatBuilder,
  createDelegation,
  DelegationFramework,
  Implementation,
  MetaMaskSmartAccount,
  SINGLE_DEFAULT_MODE,
  toMetaMaskSmartAccount,
  Delegation
} from "@metamask/delegation-toolkit";

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { optimism } from "viem/chains";

import { Call } from "viem";



import {
  bundlerClient,
  createSalt,
  publicClient,
  getFeePerGas
} from "./examples/shared";

import { type Address, type Hex, isAddressEqual, zeroAddress } from "viem";

/**
 * Create a new MetaMaskSmartAccount representing a Hybrid Delegator Smart
 * Account where the signer is a "burner" account.
 * @resolves to the MetaMaskSmartAccount instance.
 */
export const createMetaMaskAccount = async () => {
  const owner = privateKeyToAccount(generatePrivateKey());

  return await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [owner.address, [], [], []],
    deploySalt: createSalt(),
    signatory: { account: owner },
  });
};

/**
 * Create and sign a root delegation, from the delegatorAccount, to the
 * delegateAddress, allowing only a transfer of 0 ether to the zero address.
 * @param delegatorAccount - The MetaMaskSmartAccount that is creating the delegation.
 * @param delegateAddress - The address of the recipient of the delegation.
 * @resolves to the signed delegation.
 */
export const createMyDelegation = async (
  delegatorAccount: MetaMaskSmartAccount<Implementation>,
  delegateAddress: Address
) => {
  // These caveats are allowing only a transfer of 0 ether to the zero address.
  // Not a very useful operation, but it demonstrates how caveats that can be
  // applied to a delegation.
  const caveats = createCaveatBuilder(delegatorAccount.environment)
    .addCaveat("allowedTargets", [zeroAddress])
    .addCaveat("valueLte", 0n);

  const delegation = createDelegation({
    to: delegateAddress,
    from: delegatorAccount.address,
    caveats: caveats
  });

  console.info("from delegatorAddress: ", delegatorAccount.address)
  console.info("to delegateAddress: ", delegateAddress)

  const signature = await delegatorAccount.signDelegation({ delegation });
  console.info("delegation signature: ", signature)

  return {
    ...delegation,
    signature,
  };
};

/**
 * Redeem the delegation, executing a zero value Call to the zero address. If
 * the Delegator is not deployed, a Call will be inserted to deploy the account
 * before redeeming the delegation.
 * @param redeemerAccount - The MetaMaskSmartAccount redeeming the delegation.
 * Must be the `delegate` on the delegation.
 * @param delegation - The delegation being redeemed.
 * @param delegatorFactoryArgs - The factoryArgs for the delegator account, if
 * the account is not deployed.
 * @resolves to the UserOperationHash, once it has been settled on chain.
 */
export const executeOnBehalfOfDelegator = async (
  redeemerAccount: MetaMaskSmartAccount<Implementation>,
  delegation: DelegationStruct,
  delegatorFactoryArgs?: { factory: Address; factoryData: Hex }
) => {
  if (!isAddressEqual(redeemerAccount.address, delegation.delegate)) {
    throw new Error(
      `Redeemer account address not equal to delegate. Redeemer: ${redeemerAccount.address}, delegate: ${delegation.delegate}`
    );
  }

  console.info("setup delegation array")
  const delegationChain : Delegation[] = [delegation];

  // The action that the redeemer is executing on behalf of the delegator.
  const executions: ExecutionStruct[] = [
    {
      target: zeroAddress,
      value: 0n,
      callData: "0x",
    },
  ];

  console.info("redeemDelegationCalldata")
  const redeemDelegationCalldata = DelegationFramework.encode.redeemDelegations({
    delegations: [ delegationChain ],
    modes: [ SINGLE_DEFAULT_MODE ],
    executions: [ executions ]
  });

  console.info("calls")
  const calls: Call[] = [
    {
      to: redeemerAccount.address,
      data: redeemDelegationCalldata,
    },
  ];

  // The delegate is submitting the user operation, so may be deployed via initcode. If the delegator
  // is not yet on-chain, it must be deployed before redeeming the delegation. If factory
  // args are provided, an additional call is inserted into the calls array that is encoded
  // for the user operation.
  if (delegatorFactoryArgs) {

    console.info("delegator factory args: ", delegatorFactoryArgs)
    const { factory, factoryData } = delegatorFactoryArgs;

    calls.unshift({
      to: factory,
      data: factoryData,
    });

    console.info("calls after unshift: ", calls)
  }


  //const gasPrice = await publicClient.getGasPrice();
  //const maxPriorityFeePerGas = BigInt(Math.floor(Number(gasPrice) * 0.1)); // Example: 10% of gas price
  //const maxFeePerGas = gasPrice + maxPriorityFeePerGas; // Base + priority fee
  const fee = await getFeePerGas()
  console.info("gas price: ", fee)


  console.info("sendUserOperation")
  //console.info("max Gas: ", maxFeePerGas)
  //console.info("maxPriorityFeePerGas: ", maxPriorityFeePerGas)
  const userOperationHash = await bundlerClient.sendUserOperation({
    account: redeemerAccount,
    calls,
    ...fee
  });

  // This could be in a separate function, for a more responsive user experience,
  // but we leave it here for simplicity.
  return await bundlerClient.waitForUserOperationReceipt({
    hash: userOperationHash,
  });
};
