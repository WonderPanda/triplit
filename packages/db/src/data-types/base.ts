import { Static, TTuple, Type } from '@sinclair/typebox';
import { nanoid } from 'nanoid';
import {
  InvalidTypeOptionsError,
  MissingAttributeDefinitionError,
  UnrecognizedAttributeTypeError,
} from '../errors.js';
import { Value } from '@sinclair/typebox/value';
import {
  UserTypeOptionsSchema,
  UserTypeOptions,
  AttributeDefinition,
  ValueAttributeDefinition,
} from './serialization.js';
import { StringType } from './string.js';
import { DateType } from './date.js';
import { RecordType } from './record.js';
import { NumberType } from './number.js';
import { BooleanType } from './boolean.js';
import { SetType } from './set.js';
import { SerializedValueOverrides, ValueSchemaType } from './value.js';
import { QueryType } from './query.js';

export type Operator =
  | '='
  | '<'
  | '>'
  | '<='
  | '>='
  | '!='
  | 'like'
  | 'nlike'
  | 'in'
  | 'nin';

export type ValueType<TO extends UserTypeOptions> =
  | StringType<TO>
  | NumberType<TO>
  | BooleanType<TO>
  | DateType<TO>;
export type DataType =
  | ValueType<any>
  | SetType<ValueType<any>>
  | RecordType<{ [k: string]: DataType }>
  | QueryType<any>;

export type RegisterTypeFromBaseType<T extends ValueSchemaType> = TTuple<
  [T, typeof Timestamp]
> & {
  'x-crdt-type': 'Register';
  'x-serialized-type': {
    type: T['type'] | SerializedValueOverrides;
    options: UserTypeOptions;
  };
};
export const Nullable = <T extends ValueSchemaType>(type: T) =>
  Type.Union([type, Type.Null()]);

export function userTypeOptionsAreValid(options: UserTypeOptions) {
  return Value.Check(UserTypeOptionsSchema, options);
}

export const Timestamp = Type.Readonly(
  Type.Tuple([Type.Number(), Type.String()])
);
export type TimestampType = Static<typeof Timestamp>;

export function Register<T extends ValueSchemaType>(
  type: T,
  options: UserTypeOptions = {} as UserTypeOptions,
  typeOverride?: SerializedValueOverrides
) {
  if (!userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }

  const typeHelper = typeFromJSON({
    type: typeOverride || type.type,
    options,
  });

  return Type.Tuple([options.nullable ? Nullable(type) : type, Timestamp], {
    'x-serialized-type': typeHelper?.toJSON(),
    'x-crdt-type': 'Register',
  }) as RegisterTypeFromBaseType<T>;
}

// NOTE: default values must be serializable
export function calcDefaultValue(options: UserTypeOptions) {
  let attributeDefault = options.default;
  if (attributeDefault === undefined) {
    // no default object
    return undefined;
  }
  if (typeof attributeDefault !== 'object' || attributeDefault === null)
    return attributeDefault;
  else {
    const { args, func } = attributeDefault;
    if (func === 'uuid') {
      return args && typeof args[0] === 'number' ? nanoid(args[0]) : nanoid();
    } else if (func === 'now') {
      return new Date().toISOString();
    }
  }
  return undefined;
}

export function typeFromJSON(
  serializedType?: ValueAttributeDefinition
): ValueType<any>;
export function typeFromJSON(serializedType?: AttributeDefinition): DataType;
export function typeFromJSON(serializedType?: AttributeDefinition): DataType {
  if (!serializedType) throw new MissingAttributeDefinitionError();
  switch (serializedType.type) {
    case 'string':
      return StringType(serializedType.options);
    case 'number':
      return NumberType(serializedType.options);
    case 'boolean':
      return BooleanType(serializedType.options);
    case 'date':
      return DateType(serializedType.options);
    case 'set':
      return SetType(typeFromJSON(serializedType.items));
    case 'query':
      return QueryType(serializedType.query);
    case 'record':
      return RecordType(
        Object.fromEntries(
          Object.entries(serializedType.properties).map(([key, val]) => [
            key,
            typeFromJSON(val as any),
          ])
        )
      );
  }
  throw new UnrecognizedAttributeTypeError(
    (serializedType as AttributeDefinition).type
  );
}
