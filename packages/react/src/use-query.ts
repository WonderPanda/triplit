import { useEffect, useState } from 'react';
import {
  ClientFetchResult,
  TriplitClient,
  ClientQuery,
  ClientQueryBuilder,
  SubscriptionOptions,
  CollectionNameFromModels,
  Models,
} from '@triplit/client';

export function useQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<M, CN>,
  options?: SubscriptionOptions
): {
  fetching: boolean;
  fetchingRemote: boolean;
  results: ClientFetchResult<ClientQuery<M, CN>> | undefined;
  error: any;
} {
  const [results, setResults] = useState<
    ClientFetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(true);
  const [error, setError] = useState<any>(undefined);

  const builtQuery = query && query.build();
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    if (!client) return;
    setResults(undefined);
    setFetching(true);
    const unsubscribe = client.subscribe(
      builtQuery,
      (localResults, { hasRemoteFulfilled }) => {
        setFetching(false);
        setError(undefined);
        setFetchingRemote(!hasRemoteFulfilled);
        setResults(
          new Map(localResults) as ClientFetchResult<ClientQuery<M, CN>>
        );
      },
      (error) => {
        setFetching(false);
        setError(error);
      },
      options
    );

    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery, client]);

  return {
    fetching,
    fetchingRemote,
    results,
    error,
  };
}
