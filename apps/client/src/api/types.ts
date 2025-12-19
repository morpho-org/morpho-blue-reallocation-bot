import * as Types from '@morpho-org/blue-api-sdk';

export type GetVaultsDataQueryVariables = Types.Exact<{
  chainId: Types.Scalars['Int']['input'];
  addresses: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type GetVaultsDataQuery = { __typename?: 'Query', vaults: { __typename?: 'PaginatedMetaMorphos', items: Array<{ __typename?: 'Vault', address: Types.Scalars["Address"]["output"], state: { __typename?: 'VaultState', allocation: Array<{ __typename?: 'VaultAllocation', supplyAssets: Types.Scalars["BigInt"]["output"], supplyCap: Types.Scalars["BigInt"]["output"], market: { __typename?: 'Market', uniqueKey: Types.Scalars["MarketId"]["output"], irmAddress: Types.Scalars["Address"]["output"], lltv: Types.Scalars["BigInt"]["output"], collateralAsset: { __typename?: 'Asset', address: Types.Scalars["Address"]["output"] } | null, loanAsset: { __typename?: 'Asset', address: Types.Scalars["Address"]["output"] }, oracle: { __typename?: 'Oracle', address: Types.Scalars["Address"]["output"] } | null, state: { __typename?: 'MarketState', supplyAssets: Types.Scalars["BigInt"]["output"], supplyShares: Types.Scalars["BigInt"]["output"], borrowAssets: Types.Scalars["BigInt"]["output"], borrowShares: Types.Scalars["BigInt"]["output"], rateAtTarget: Types.Scalars["BigInt"]["output"] | null, fee: number, timestamp: Types.Scalars["BigInt"]["output"] } | null } }> } | null }> | null } };
