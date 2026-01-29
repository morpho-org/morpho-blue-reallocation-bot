import * as Types from './types.js';

import { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];

export const GetVaultsDataDocument = gql`
    query getVaultsData($chainId: Int!, $addresses: [String!]!) {
  vaults(first: 1000, where: {chainId_in: [$chainId], address_in: $addresses}) {
    items {
      address
      state {
        allocation {
          market {
            uniqueKey
            collateralAsset {
              address
            }
            loanAsset {
              address
            }
            oracle {
              address
            }
            irmAddress
            lltv
            state {
              supplyAssets
              supplyShares
              borrowAssets
              borrowShares
              rateAtTarget
              fee
              timestamp
            }
          }
          supplyAssets
          supplyCap
        }
      }
    }
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    getVaultsData(variables: Types.GetVaultsDataQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<Types.GetVaultsDataQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<Types.GetVaultsDataQuery>({ document: GetVaultsDataDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'getVaultsData', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;