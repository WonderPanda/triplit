import { expectTypeOf, test, describe } from 'vitest';
import DB, { ModelFromModels } from '../../src/db.js';
import { Schema as S } from '../../src/schema.js';
import { QueryOrder, QueryWhere, WhereFilter } from '../../src/query.js';

// Want to figure out the best way to test various data types + operation combos
// Right now im reusing this exhaustive schema (also defined in cli tests)

describe('schemaful', () => {
  test('insert: collection param includes all collections', () => {
    const schema = {
      collections: {
        a: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
        b: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
        c: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
      },
    };
    const db = new DB({ schema });
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
  });
  test('insert: entity param properly reads from schema', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            // value types
            string: S.String(),
            boolean: S.Boolean(),
            number: S.Number(),
            date: S.Date(),
            // set type
            setString: S.Set(S.String()),
            setNumber: S.Set(S.Number()),
            // record type
            record: S.Record({
              attr1: S.String(),
              attr2: S.String(),
            }),
            // nullable
            nullableFalse: S.String({ nullable: false }),
            nullableTrue: S.String({ nullable: true }),
            // default values
            defaultValue: S.String({ default: 'default' }),
            defaultNull: S.String({ default: null }),
            // default functions
            defaultNow: S.String({ default: S.Default.now() }),
            defaultUuid: S.String({ default: S.Default.uuid() }),
            // subqueries
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const expectEntityParam = expectTypeOf(db.insert).parameter(1);

    expectEntityParam.toHaveProperty('string').toEqualTypeOf<string>();

    expectEntityParam.toHaveProperty('boolean').toEqualTypeOf<boolean>();

    expectEntityParam.toHaveProperty('number').toEqualTypeOf<number>();

    expectEntityParam.toHaveProperty('date').toEqualTypeOf<Date>();

    // Sets always have a default so can be undefined
    expectEntityParam
      .toHaveProperty('setString')
      .toEqualTypeOf<Set<string> | undefined>();

    expectEntityParam
      .toHaveProperty('setNumber')
      .toEqualTypeOf<Set<number> | undefined>();

    // records always have a default so can be undefined
    expectEntityParam
      .toHaveProperty('record')
      .toEqualTypeOf<{ attr1: string; attr2: string } | undefined>();

    expectEntityParam.toHaveProperty('nullableFalse').toEqualTypeOf<string>();

    expectEntityParam
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();

    expectEntityParam
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultNow')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam.not.toHaveProperty('subquery');
  });
  test.todo('insert: collection param informs entity param'); // Not sure how to test this, but collectionName should narrow the type of entity param

  test('update: collection param includes all collections', () => {
    const schema = {
      collections: {
        a: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
        b: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
        c: {
          schema: S.Schema({
            id: S.Id(),
            attr: S.String(),
          }),
        },
      },
    };
    const db = new DB({ schema });
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
  });
  test('update: entity param in updater properly reads proxy values from schema', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            // value types
            string: S.String(),
            boolean: S.Boolean(),
            number: S.Number(),
            date: S.Date(),
            // set type
            setString: S.Set(S.String()),
            setNumber: S.Set(S.Number()),
            // record type
            record: S.Record({
              attr1: S.String(),
              attr2: S.String(),
            }),
            // nullable
            nullableFalse: S.String({ nullable: false }),
            nullableTrue: S.String({ nullable: true }),
            // default values
            defaultValue: S.String({ default: 'default' }),
            defaultNull: S.String({ default: null }),
            // default functions
            defaultNow: S.String({ default: S.Default.now() }),
            defaultUuid: S.String({ default: S.Default.uuid() }),
            // subqueries
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const expectEntityProxyParam = expectTypeOf(db.update)
      .parameter(2)
      .parameter(0);

    expectEntityProxyParam.toHaveProperty('string').toEqualTypeOf<string>();
    expectEntityProxyParam.toHaveProperty('boolean').toEqualTypeOf<boolean>();
    expectEntityProxyParam.toHaveProperty('number').toEqualTypeOf<number>();
    expectEntityProxyParam.toHaveProperty('date').toEqualTypeOf<Date>();

    expectEntityProxyParam
      .toHaveProperty('setString')
      .toEqualTypeOf<Set<string>>();

    expectEntityProxyParam
      .toHaveProperty('setNumber')
      .toEqualTypeOf<Set<number>>();

    expectEntityProxyParam
      .toHaveProperty('record')
      .toEqualTypeOf<{ attr1: string; attr2: string }>();

    expectEntityProxyParam
      .toHaveProperty('nullableFalse')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();
    expectEntityProxyParam
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string>();
    expectEntityProxyParam.toHaveProperty('defaultNow').toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string>();

    expectEntityProxyParam.not.toHaveProperty('subquery');
  });

  test('fetch: returns a map of properly typed entities', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            // value types
            string: S.String(),
            boolean: S.Boolean(),
            number: S.Number(),
            date: S.Date(),
            // set type
            setString: S.Set(S.String()),
            setNumber: S.Set(S.Number()),
            // record type
            record: S.Record({
              attr1: S.String(),
              attr2: S.String(),
            }),
            // nullable
            nullableFalse: S.String({ nullable: false }),
            nullableTrue: S.String({ nullable: true }),
            // default values
            defaultValue: S.String({ default: 'default' }),
            defaultNull: S.String({ default: null }),
            // default functions
            defaultNow: S.String({ default: S.Default.now() }),
            defaultUuid: S.String({ default: S.Default.uuid() }),
            // subqueries
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const query = db.query('test').build();
    expectTypeOf(db.fetch(query)).resolves.toEqualTypeOf<
      Map<
        string,
        {
          id: string;
          string: string;
          boolean: boolean;
          number: number;
          date: Date;
          setString: Set<string>;
          setNumber: Set<number>;
          record: { attr1: string; attr2: string };
          nullableFalse: string;
          nullableTrue: string | null;
          defaultValue: string;
          defaultNull: string;
          defaultNow: string;
          defaultUuid: string;
        }
      >
    >();
  });
});

describe('schemaless', () => {
  test('insert: collection param is string', () => {
    const db = new DB();
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<string>();
  });
  test('insert: entity param is any', () => {
    const db = new DB();
    expectTypeOf(db.insert).parameter(1).toEqualTypeOf<any>();
  });

  test('update: collection param is string', () => {
    const db = new DB();
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<string>();
  });
  test('update: entity param in updater is any', () => {
    const db = new DB();
    expectTypeOf(db.update).parameter(2).parameter(0).toEqualTypeOf<any>();
  });

  test('fetch: returns a Map<string, any>', () => {
    const db = new DB();
    const query = db.query('test').build();
    expectTypeOf(db.fetch(query)).resolves.toEqualTypeOf<Map<string, any>>();
  });
});

describe('query builder', () => {
  test('select', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.String(),
            attr2: S.Boolean(),
            attr3: S.Number(),
            record: S.Record({
              attr1: S.String(),
            }),

            // Not included
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.select)
        .parameter(0)
        .toEqualTypeOf<
          ('attr1' | 'attr2' | 'attr3' | 'record' | 'record.attr1' | 'id')[]
        >();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.select).parameter(0).toEqualTypeOf<string[]>();
    }
  });
  test('where attribute prop', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.Record({
              inner1: S.Record({
                inner1A: S.String(),
                inner1B: S.String(),
              }),
              inner2: S.Record({
                inner2A: S.String(),
              }),
            }),
            attr2: S.Boolean(),
            // should include query
            query: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.where)
        .parameter(0)
        .toMatchTypeOf<
          | 'id'
          | 'attr1'
          | 'attr1.inner1'
          | 'attr1.inner1.inner1A'
          | 'attr1.inner1.inner1B'
          | 'attr1.inner2'
          | 'attr1.inner2.inner2A'
          | 'attr2'
          | 'query'
          | WhereFilter<ModelFromModels<(typeof schema)['collections'], 'test'>>
          | QueryWhere<ModelFromModels<(typeof schema)['collections'], 'test'>>
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.where)
        .parameter(0)
        .toMatchTypeOf<
          string | WhereFilter<undefined> | QueryWhere<undefined>
        >();
    }
  });

  test('order attribute prop', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.Record({
              inner1: S.Record({
                inner1A: S.String(),
                inner1B: S.String(),
              }),
              inner2: S.Record({
                inner2A: S.String(),
              }),
            }),
            attr2: S.Boolean(),
            // should not include query
            query: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.order)
        .parameter(0)
        .toMatchTypeOf<
          | 'id'
          | 'attr1'
          | 'attr1.inner1'
          | 'attr1.inner1.inner1A'
          | 'attr1.inner1.inner1B'
          | 'attr1.inner2'
          | 'attr1.inner2.inner2A'
          | 'attr2'
          | QueryOrder<ModelFromModels<(typeof schema)['collections'], 'test'>>
          | QueryOrder<
              ModelFromModels<(typeof schema)['collections'], 'test'>
            >[]
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.where)
        .parameter(0)
        .toMatchTypeOf<
          string | WhereFilter<undefined> | QueryWhere<undefined>
        >();
    }
  });
});

type MapKey<M> = M extends Map<infer K, any> ? K : never;
type MapValue<M> = M extends Map<any, infer V> ? V : never;

describe('fetching', () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr1: S.String(),
          attr2: S.Boolean(),
          attr3: S.Number(),

          // Not included
          subquery: S.Query({ collectionName: 'test2', where: [] }),
        }),
      },
    },
  };

  test('fetch', async () => {
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test').build();
      const res = await db.fetch(query);

      expectTypeOf<MapKey<typeof res>>().toEqualTypeOf<string>();
      const expectValueTypeOf = expectTypeOf<MapValue<typeof res>>();
      expectValueTypeOf.toHaveProperty('attr1').toEqualTypeOf<string>();
      expectValueTypeOf.toHaveProperty('attr2').toEqualTypeOf<boolean>();
      expectValueTypeOf.toHaveProperty('attr3').toEqualTypeOf<number>();
      expectValueTypeOf.not.toHaveProperty('subquery');
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test').build();
      expectTypeOf(db.fetch(query)).resolves.toEqualTypeOf<Map<string, any>>();
    }
  });

  test('fetchById', () => {
    // Schemaful
    {
      const db = new DB({ schema });
      expectTypeOf(db.fetchById('test', 'id')).resolves.toEqualTypeOf<{
        id: string;
        attr1: string;
        attr2: boolean;
        attr3: number;
      } | null>();
    }
    // schemaless
    {
      const db = new DB();
      expectTypeOf(db.fetchById('test', 'id')).resolves.toBeAny();
    }
  });

  test('fetchOne', () => {
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test').build();
      expectTypeOf(db.fetchOne(query)).resolves.toEqualTypeOf<
        | [
            string,
            {
              id: string;
              attr1: string;
              attr2: boolean;
              attr3: number;
            }
          ]
        | null
      >();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test').build();
      expectTypeOf(db.fetchOne(query)).resolves.toEqualTypeOf<
        [string, any] | null
      >();
    }
  });
});
