/**
 * JSON Schema v7, copied from `@jsonforms/core`.
 *
 * Because json forms defines json schema as v4 | v7, which will
 * break some type checking when inside generic.
 *
 * This type is only used in the editor for code completion, it does not need
 * to be very accurate like the one in `ajv`.
 */
export interface JsonSchema<TUIOptions = Record<string, unknown>> {
  '$ref'?: string
  /**
   * This is important because it tells refs where
   * the root of the document is located
   */
  '$id'?: string
  /**
   * It is recommended that the meta-schema is
   * included in the root of any JSON Schema
   */
  '$schema'?: string
  /**
   * Title of the schema
   */
  'title'?: string
  /**
   * Schema description
   */
  'description'?: string
  /**
   * Default json for the object represented by
   * this schema
   */
  'default'?: any
  /**
   * The value must be a multiple of the number
   * (e.g. 10 is a multiple of 5)
   */
  'multipleOf'?: number
  'maximum'?: number
  /**
   * If true maximum must be > value, >= otherwise
   */
  'exclusiveMaximum'?: number
  'minimum'?: number
  /**
   * If true minimum must be < value, <= otherwise
   */
  'exclusiveMinimum'?: number
  'maxLength'?: number
  'minLength'?: number
  /**
   * This is a regex string that the value must
   * conform to
   */
  'pattern'?: string
  'additionalItems'?: boolean | JsonSchema
  'items'?: JsonSchema | JsonSchema[]
  'maxItems'?: number
  'minItems'?: number
  'uniqueItems'?: boolean
  'maxProperties'?: number
  'minProperties'?: number
  'required'?: string[]
  'additionalProperties'?: boolean | JsonSchema
  /**
   * Holds simple JSON Schema definitions for
   * referencing from elsewhere.
   */
  'definitions'?: {
    [key: string]: JsonSchema
  }
  /**
   * The keys that can exist on the object with the
   * json schema that should validate their value
   */
  'properties'?: {
    [property: string]: JsonSchema
  }
  /**
   * The key of this object is a regex for which
   * properties the schema applies to
   */
  'patternProperties'?: {
    [pattern: string]: JsonSchema
  }
  /**
   * If the key is present as a property then the
   * string of properties must also be present.
   * If the value is a JSON Schema then it must
   * also be valid for the object if the key is
   * present.
   */
  'dependencies'?: {
    [key: string]: JsonSchema | string[]
  }
  /**
   * Enumerates the values that this schema can be
   * e.g.
   * {"type": "string",
   *  "enum": ["red", "green", "blue"]}
   */
  'enum'?: any[]
  /**
   * The basic type of this schema, can be one of
   * [string, number, object, array, boolean, null]
   * or an array of the acceptable types
   */
  'type'?: string | string[]
  'allOf'?: JsonSchema[]
  'anyOf'?: JsonSchema[]
  'oneOf'?: JsonSchema[]
  /**
   * The entity being validated must not match this schema
   */
  'not'?: JsonSchema
  'format'?: string
  'readOnly'?: boolean
  'writeOnly'?: boolean
  'examples'?: any[]
  'contains'?: JsonSchema
  'propertyNames'?: JsonSchema
  'const'?: any
  'if'?: JsonSchema
  'then'?: JsonSchema
  'else'?: JsonSchema
  'errorMessage'?: any

  /// Custom properties

  /** Specify widget to render */
  'ui:widget'?: string
  /** Options for the widget */
  'ui:options'?: TUIOptions
  /** https://json-schema.org/understanding-json-schema/reference/non_json_data#contentmediatype */
  'contentMediaType'?: string
}
