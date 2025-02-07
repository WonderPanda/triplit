import {
  CollectionAttributeDefinition,
  AttributeDefinition,
  Model,
} from '@triplit/db';
import { useEffect, useMemo, useState } from 'react';
import '@glideapps/glide-data-grid/dist/index.css';
import { SetInput } from '@/components/ui/set-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { randomId } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { CloseButton } from '@/components/ui/close-button';
import { FormField } from '@/components/ui/form-field';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CollectionTypeKeys,
  RecordAttributeDefinition,
  ValueTypeKeys,
} from '@triplit/db/src/data-types/serialization.js';
import { Collection } from '@triplit/db/src/schema.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Code } from '@/components/ui/code';
import { TriplitClient } from '@triplit/client';
import { Plus } from 'lucide-react';

interface FormValues {
  id: string;
  attributes: {
    fieldName: string;
    definition: AttributeDefinition;
    fieldValue: string | Set<any>;
    key: string;
  }[];
}

function convertFormValueToTriplitValue(
  value: string | Record<string, any>,
  definition: AttributeDefinition
) {
  const hasDefaultFunction = !!definition?.options?.default?.func;
  if (hasDefaultFunction && !value) return undefined;
  if (definition?.options?.nullable && value === null) return null;
  if (definition.type === 'boolean') return value === 'true';
  if (definition.type === 'number') return Number(value);
  if (definition.type === 'date') return new Date(value);
  if (definition.type === 'record')
    return Object.fromEntries(
      Object.entries(value).map(([name, value]) => [
        name,
        convertFormValueToTriplitValue(value, definition.properties[name]),
      ])
    );
  return value;
}

function convertFormToEntity(
  attributes: FormValues['attributes'],
  model?: Model<any>
) {
  const entity: any = {};
  attributes.forEach((attr) => {
    const { definition, fieldValue, fieldName } = attr;
    const triplitValue = convertFormValueToTriplitValue(fieldValue, definition);
    if (triplitValue !== undefined) entity[fieldName] = triplitValue;
  });
  return entity;
}

function getDefaultFormValueForAttribute(definition: AttributeDefinition): any {
  const hasDefaultValue =
    definition?.options?.default !== undefined &&
    typeof definition?.options?.default !== 'object';
  if (hasDefaultValue) return definition.options.default;
  if (definition.type === 'record')
    return Object.fromEntries(
      Object.entries(definition.properties).map(([name, definition]) => [
        name,
        getDefaultFormValueForAttribute(definition),
      ])
    );
  if (definition.type === 'set') return new Set();
  if (definition.type === 'boolean') return '';
  if (definition.type === 'number') return '';
  if (definition.type === 'date') return '';
  if (definition.type === 'string') return '';
  return '';
}

function initializeNewEntityForm(model?: Collection<any>): FormValues {
  if (!model) return { id: '', attributes: [] };
  const attributes = (
    Object.entries(model.schema.properties) as [
      string,
      Exclude<AttributeDefinition, RecordAttributeDefinition>
    ][]
  )
    .filter(
      ([_attr, definition]) => definition.type !== 'query' && _attr !== 'id'
    )
    .map(([attr, definition]) => {
      return {
        definition,
        fieldName: attr,
        fieldValue: getDefaultFormValueForAttribute(definition),
        key: attr,
      };
    });
  return { id: '', attributes };
}

function TypeLabel({
  name,
  type,
  setItemsType,
}: {
  name: string;
  type: ValueTypeKeys | CollectionTypeKeys;
  setItemsType?: ValueTypeKeys;
}) {
  return (
    <div className="flex flex-row gap-2 items-center w-full">
      {name}
      {
        <div className="text-xs text-zinc-500">
          {`${type}`}
          {setItemsType && (
            <span className="text-blue-800">
              {'<'}
              <span className="text-zinc-500">{setItemsType}</span>
              {'>'}
            </span>
          )}
        </div>
      }
    </div>
  );
}

export function CreateEntitySheet({
  collection,
  inferredAttributes,
  collectionDefinition,
  client,
}: {
  collection: string;
  inferredAttributes?: string[];
  collectionDefinition?: Collection<any>;
  client: TriplitClient<any>;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    initialValues: initializeNewEntityForm(collectionDefinition),
  });

  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const allAttributes = [
    ...(inferredAttributes ? inferredAttributes : []),
    ...customAttributes,
  ];
  const unselectedAttributes = useMemo(() => {
    if (allAttributes.length === 0 || collectionDefinition) return [];
    return allAttributes.filter(
      (attr) => !form.values.attributes.find((item) => item.fieldName === attr)
    );
  }, [form.values.attributes, collectionDefinition, allAttributes]);

  useEffect(() => {
    form.setValues(initializeNewEntityForm(collectionDefinition));
    setCustomAttributes([]);
  }, [collection, collectionDefinition]);

  const fields = useMemo(
    () =>
      form.values.attributes.map((item, index) => (
        <div
          key={item.key}
          className={`flex w-full flex-row ${
            collectionDefinition ? 'items-center' : 'items-start'
          } gap-2`}
        >
          {!collectionDefinition && (
            <>
              <Combobox
                placeholder="Add an attribute..."
                className="w-[37.5%]"
                data={unselectedAttributes.concat(
                  item.fieldName ? [item.fieldName] : []
                )}
                onAddValue={(query) => {
                  setCustomAttributes((prev) => [...prev, query]);
                  return query;
                }}
                value={item.fieldName}
                onChangeValue={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldName`, value);
                }}
              />
              <Select
                className="w-1/4"
                data={['string', 'boolean', 'number']}
                value={item.definition.type}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.definition`, {
                    value,
                  });
                }}
              />
            </>
          )}
          <FormField
            label={
              collectionDefinition && (
                <TypeLabel
                  name={item.fieldName}
                  type={item.definition.type}
                  setItemsType={
                    item.definition.type === 'set'
                      ? item.definition.items.type
                      : undefined
                  }
                />
              )
            }
          >
            {item.definition.type === 'string' && (
              <Textarea
                disabled={item.fieldValue === null}
                value={item.fieldValue ?? ''}
                onChange={(e) => {
                  form.setFieldValue(
                    `attributes.${index}.fieldValue`,
                    e.target.value
                  );
                }}
              />
            )}
            {item.definition.type === 'number' && (
              <Input
                type="number"
                disabled={item.fieldValue === null}
                {...form.getInputProps(`attributes.${index}.fieldValue`)}
              />
            )}
            {item.definition.type === 'date' && (
              <Input
                type="datetime-local"
                disabled={item.fieldValue === null}
                {...form.getInputProps(`attributes.${index}.fieldValue`)}
              />
            )}
            {item.definition.type === 'boolean' && (
              <Select
                disabled={item.fieldValue === null}
                data={['true', 'false']}
                value={item.fieldValue}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
              />
            )}
            {item.definition.type === 'set' && (
              <SetInput
                value={form.values.attributes[index].fieldValue}
                onChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
                renderItem={
                  item.definition.items.type === 'date'
                    ? (date: Date) => date.toISOString()
                    : undefined
                }
                parse={PARSE_FUNCS[item.definition.items.type]}
              />
            )}
            {item.definition.type === 'record' &&
              Object.entries(item.definition.properties).map(
                ([name, definition]) => (
                  <div className="flex flex-row gap-2" key={name}>
                    <div className="ml-10 w-1/4">
                      <TypeLabel
                        name={name}
                        type={item.definition.properties[name].type}
                      />
                    </div>
                    {definition.type === 'string' && (
                      <Textarea
                        key={name}
                        disabled={item.fieldValue === null}
                        {...form.getInputProps(
                          `attributes.${index}.fieldValue.${name}`
                        )}
                      />
                    )}
                    {definition.type === 'number' && (
                      <Input
                        type="number"
                        disabled={item.fieldValue === null}
                        {...form.getInputProps(
                          `attributes.${index}.fieldValue.${name}`
                        )}
                      />
                    )}
                    {definition.type === 'date' && (
                      <Input
                        type="datetime-local"
                        disabled={item.fieldValue === null}
                        {...form.getInputProps(
                          `attributes.${index}.fieldValue.${name}`
                        )}
                      />
                    )}

                    {definition.type === 'boolean' && (
                      <Select
                        disabled={item.fieldValue === null}
                        data={['true', 'false']}
                        value={item.fieldValue[name]}
                        onValueChange={(value) => {
                          form.setFieldValue(
                            `attributes.${index}.fieldValue.${name}`,
                            value
                          );
                        }}
                      />
                    )}
                  </div>
                )
              )}
            {item?.definition?.options?.default?.func && (
              <div className="text-muted-foreground">{`Default: ${item?.definition?.options?.default?.func}()`}</div>
            )}
          </FormField>
          {(item.definition?.options?.nullable || !collectionDefinition) && (
            <div className="flex flex-col gap-2 self-end items-center mb-[10px]">
              <p className="text-sm mb-2">Null?</p>
              <Checkbox
                className="h-[20px] w-[20px]"
                checked={item.fieldValue === null}
                onCheckedChange={(checked) => {
                  checked
                    ? form.setFieldValue(`attributes.${index}.fieldValue`, null)
                    : form.setFieldValue(`attributes.${index}.fieldValue`, '');
                }}
              />
            </div>
          )}
          {!collectionDefinition && (
            <CloseButton
              onClick={() => form.removeListItem('attributes', index)}
            />
          )}
        </div>
      )),
    [
      form,
      collectionDefinition,
      inferredAttributes,
      unselectedAttributes,
      customAttributes,
    ]
  );
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size={'sm'}
          variant={'secondary'}
          className="bg-green-950 hover:bg-green-900 text-green-400 gap-1 py-1 h-auto"
        >
          <Plus className="h-4 w-4" />
          Insert
        </Button>
      </SheetTrigger>
      <SheetContent className="text-sm sm:max-w-[40%]">
        <SheetHeader>
          <SheetTitle>Insert entity</SheetTitle>
          <SheetDescription>
            Create a new entity in <Code>{collection}</Code>
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              let entity = convertFormToEntity(form.values.attributes);
              if (form.values.id)
                entity = Object.assign(entity, { id: form.values.id });
              console.log(entity);
              await client.insert(collection, entity);
              setOpen(false);
            } catch (e) {
              console.error(e);
            }
          }}
          className="flex flex-col gap-4 mt-8"
        >
          <FormField label="id" description="The primary key for this entity">
            <Input
              placeholder="auto-generate (leave blank)"
              {...form.getInputProps('id')}
            />
          </FormField>
          {!collectionDefinition && (
            <div className="text-xs -mb-3">Attributes</div>
          )}
          {fields}
          {!collectionDefinition && (
            <Button
              variant={'default'}
              type="button"
              onClick={() => {
                form.insertListItem('attributes', {
                  fieldName:
                    unselectedAttributes.length > 0
                      ? unselectedAttributes[0]
                      : '',
                  definition: { type: 'string' },
                  fieldValue: '',
                  key: randomId(),
                });
              }}
            >
              Add attribute
            </Button>
          )}
          <SheetFooter>
            {/* todo update so that onClose clears state */}
            <Button
              type="button"
              onClick={() => setOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function parseDate(value: string) {
  const val = new Date(value);
  if (String(val) === 'Invalid Date') throw new Error('Invalid Date');
  return val;
}

function parseNumber(value: string) {
  const val = Number(value);
  if (isNaN(val)) throw new Error('Invalid Number');
  return val;
}

function parseBoolean(value: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Invalid Boolean');
}

export const PARSE_FUNCS = {
  date: parseDate,
  number: parseNumber,
  boolean: parseBoolean,
};
