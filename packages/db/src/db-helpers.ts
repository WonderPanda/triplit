import { CollectionQuery } from './collection-query.js';
import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  InvalidSchemaPathError,
  ModelNotFoundError,
  NoSchemaRegisteredError,
  SessionVariableNotFoundError,
  ValueSchemaMismatchError,
} from './errors.js';
import { QueryWhere, FilterStatement, SubQueryFilter } from './query.js';
import {
  Model,
  Models,
  getSchemaFromPath,
  schemaToTriples,
  triplesToSchema,
} from './schema.js';
import {
  Attribute,
  TripleStore,
  TripleStoreApi,
  Value,
} from './triple-store.js';
import { VALUE_TYPE_KEYS } from './data-types/serialization.js';
import DB, {
  CollectionFromModels,
  CollectionNameFromModels,
  DBFetchOptions,
} from './db.js';
import { DBTransaction } from './db-transaction.js';

const ID_SEPARATOR = '#';

export function validateExternalId(id: string): Error | undefined {
  if (!id) {
    return new InvalidEntityIdError(id, 'id cannot be undefined.');
  }
  if (String(id).includes(ID_SEPARATOR)) {
    return new InvalidEntityIdError(id, `Id cannot include ${ID_SEPARATOR}.`);
  }
  return;
}

export function appendCollectionToId(collectionName: string, id: string) {
  return `${collectionName}${ID_SEPARATOR}${id}`;
}

export function splitIdParts(id: string): [collectionName: string, id: string] {
  const parts = id.split(ID_SEPARATOR);
  if (parts.length !== 2) {
    throw new InvalidInternalEntityIdError(
      `Malformed ID: ${id} should only include one separator(${ID_SEPARATOR})`
    );
  }
  return [parts[0], parts[1]];
}

export function stripCollectionFromId(id: string): string {
  const [_collection, entityId] = splitIdParts(id);
  return entityId;
}

export function replaceVariablesInFilterStatements<
  M extends Model<any> | undefined
>(statements: QueryWhere<M>, variables: Record<string, any>): QueryWhere<M> {
  return statements.map((filter) => {
    if ('exists' in filter) return filter;
    if (!(filter instanceof Array)) {
      filter.filters = replaceVariablesInFilterStatements(
        filter.filters,
        variables
      );
      return filter;
    }
    const replacedValue = replaceVariable(filter[2], variables);
    return [filter[0], filter[1], replacedValue] as FilterStatement<M>;
  });
}

export function replaceVariable(
  target: any,
  variables: Record<string, any> = {}
) {
  if (typeof target !== 'string') return target;
  if (!target.startsWith('$')) return target;
  const varValue = variables[target.slice(1)];
  if (!varValue) throw new SessionVariableNotFoundError(target);
  return varValue;
}

export function replaceVariablesInQuery<
  Q extends Pick<CollectionQuery<any, any>, 'where' | 'entityId' | 'vars'>
>(query: Q): Q {
  // const variables = { ...(db.variables ?? {}), ...(query.vars ?? {}) };
  const where = replaceVariablesInFilterStatements(
    query.where,
    query.vars ?? {}
  );
  const entityId = query.entityId
    ? replaceVariable(query.entityId, query.vars ?? {})
    : undefined;

  return { ...query, where, entityId };
}

export function* filterStatementIterator<M extends Model<any> | undefined>(
  statements: QueryWhere<M>
): Generator<FilterStatement<M> | SubQueryFilter> {
  for (const statement of statements) {
    if (!(statement instanceof Array) && 'filters' in statement) {
      yield* filterStatementIterator(statement.filters);
    } else {
      yield statement;
    }
  }
}

export function someFilterStatements<M extends Model<any> | undefined>(
  statements: QueryWhere<M>,
  someFunction: (statement: SubQueryFilter | FilterStatement<M>) => boolean
): boolean {
  for (const statement of filterStatementIterator(statements)) {
    if (someFunction(statement)) return true;
  }
  return false;
}

export function mapFilterStatements<M extends Model<any> | undefined>(
  statements: QueryWhere<M>,
  mapFunction: (
    statement: SubQueryFilter | FilterStatement<M>
  ) => SubQueryFilter | FilterStatement<M>
): QueryWhere<M> {
  return statements.map((filter) => {
    // TODO this doesn't feel right to just exclude sub-queries here
    if ('exists' in filter) return filter;
    if (!(filter instanceof Array) && 'filters' in filter) {
      filter.filters = mapFilterStatements(filter.filters, mapFunction);
      return filter;
    }
    return mapFunction(filter);
  });
}

export function everyFilterStatement(
  statements: QueryWhere<any>,
  everyFunction: (statement: FilterStatement<any>) => boolean
): boolean {
  return statements.every((filter) => {
    if (!(filter instanceof Array) && 'filters' in filter) {
      return everyFilterStatement(filter.filters, everyFunction);
    }
    // TODO should this traverse sub-queries?
    if ('exists' in filter) return true;
    return everyFunction(filter);
  });
}

export async function getSchemaTriples(tripleStore: TripleStoreApi) {
  return tripleStore.findByEntity(appendCollectionToId('_metadata', '_schema'));
}

export async function readSchemaFromTripleStore(tripleStores: TripleStoreApi) {
  const schemaTriples = await getSchemaTriples(tripleStores);
  const schema =
    schemaTriples.length > 0 ? triplesToSchema(schemaTriples) : undefined;
  return {
    schema,
    schemaTriples,
  };
}

export type StoreSchema<M extends Models<any, any> | undefined> =
  M extends Models<any, any>
    ? {
        version: number;
        collections: M;
      }
    : M extends undefined
    ? undefined
    : never;

export async function overrideStoredSchema(
  tripleStore: TripleStore,
  schema: StoreSchema<Models<any, any>>
) {
  const existingTriples = await tripleStore.findByEntity(
    appendCollectionToId('_metadata', '_schema')
  );
  await tripleStore.deleteTriples(existingTriples);

  const triples = schemaToTriples(schema);
  // TODO use tripleStore.setValues
  const ts = await tripleStore.clock.getNextTimestamp();
  const normalizedTriples = triples.map(([e, a, v]) => ({
    id: e,
    attribute: a,
    value: v,
    timestamp: ts,
    expired: false,
  }));
  await tripleStore.insertTriples(normalizedTriples);
}

export function validateTriple(
  schema: Models<any, any>,
  attribute: Attribute,
  value: Value
) {
  if (schema == undefined) {
    throw new NoSchemaRegisteredError(
      'Unable to run triple validation due to missing schema. This is unexpected and likely a bug.'
    );
  }
  const [modelName, ...path] = attribute;

  // TODO: remove this hack
  if (modelName === '_collection') return;
  if (modelName === '_metadata') return;

  const model = schema[modelName];
  if (!model) {
    throw new ModelNotFoundError(modelName as string, Object.keys(schema));
  }

  const valueSchema = getSchemaFromPath(model.schema, path);
  // allow record marker for certain types
  if (value === '{}' && ['record', 'set'].includes(valueSchema.type)) return;

  // We expect you to set values at leaf nodes
  // Our leafs should be value types, so use that as check
  const isLeaf = (VALUE_TYPE_KEYS as unknown as string[]).includes(
    valueSchema.type
  );
  if (!isLeaf)
    throw new InvalidSchemaPathError(
      path as string[],
      'Cannot set a non-value type to a value. For example, you may be attempting to set a value on a record type.'
    );
  // Leaf values are an array [value, timestamp], so check value
  if (!valueSchema.validateTripleValue(value))
    throw new ValueSchemaMismatchError(
      modelName as string,
      attribute as string[],
      value
    );
}

export async function getCollectionSchema<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(tx: DB<M> | DBTransaction<M>, collectionName: CN) {
  const res = await tx.getSchema();
  const { collections } = res ?? {};
  if (!collections || !collections[collectionName]) return undefined;
  const collectionSchema = collections[collectionName] as CollectionFromModels<
    M,
    CN
  >;
  return collectionSchema;
}

export function addReadRulesToQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, collection: CollectionFromModels<M>): Q {
  if (collection?.rules?.read) {
    const updatedWhere = [
      ...query.where,
      ...Object.values(collection.rules.read).flatMap((rule) => rule.filter),
    ];
    return { ...query, where: updatedWhere };
  }
  return query;
}

export async function prepareQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(tx: DB<M> | DBTransaction<M>, query: Q, options: DBFetchOptions) {
  let fetchQuery = { ...query };
  const collectionSchema = await getCollectionSchema(
    tx,
    fetchQuery.collectionName
  );
  if (collectionSchema && !options.skipRules) {
    fetchQuery = addReadRulesToQuery<M, Q>(fetchQuery, collectionSchema);
  }
  fetchQuery.vars = { ...tx.variables, ...(fetchQuery.vars ?? {}) };
  fetchQuery.where = mapFilterStatements(fetchQuery.where, (statement) => {
    if (!Array.isArray(statement)) return statement;
    const [prop, op, val] = statement;
    // TODO: should be integrated into type system
    return [prop, op, val instanceof Date ? val.toISOString() : val];
  });
  if (collectionSchema) {
    fetchQuery.where = mapFilterStatements(fetchQuery.where, (statement) => {
      if (!Array.isArray(statement)) return statement;
      const [prop, op, val] = statement;
      const attributeType = getSchemaFromPath(
        collectionSchema.schema,
        (prop as string).split('.')
      );
      if (attributeType.type !== 'query') {
        return [prop, op, val];
      }
      const [_collectionName, ...path] = (prop as string).split('.');
      const subquery = { ...attributeType.query };
      subquery.where = [...subquery.where, [path.join('.'), op, val]];
      return {
        exists: subquery,
      };
    });
  }
  return { query: fetchQuery, collection: collectionSchema };
}
