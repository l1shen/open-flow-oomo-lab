import type { ExpressionResult } from '../expression/index.ts'
import type { Schema } from '../types.ts'
import type { ExtendsSchema, ExtendsSchemaClass } from './types.ts'

import { toExpression, ExpressionNone, ExpressionSingleResult } from '../expression/index.ts'
import { createId } from '../utils.ts'

export class ExtendsContext {
  private readonly extendsSchemaClasses: readonly ExtendsSchemaClass[]

  public constructor(extendsSchemaClasses: readonly ExtendsSchemaClass[] = []) {
    this.extendsSchemaClasses = Object.freeze([...extendsSchemaClasses])
  }

  public tryCompiledExtendsSchema(target: object, payload?: unknown): ExtendsSchema | null {
    for (const extendsSchemaClass of this.extendsSchemaClasses) {
      if (extendsSchemaClass.isMatch(target)) {
        return new extendsSchemaClass(createId(), target, payload)
      }
    }
    return null
  }

  public isExtendsSchema(target: object): target is ExtendsSchema {
    for (const extendsSchemaClass of this.extendsSchemaClasses) {
      if (target instanceof extendsSchemaClass) {
        return true
      }
    }
    return false
  }

  public calculate(schema1: Schema<unknown>, schema2: Schema<unknown>): ExpressionResult {
    const schemaClass = this.findMatchedClass(schema1, schema2)
    const shouldSwap = !(schema1 instanceof schemaClass)

    let expressionResult: ExpressionResult = ExpressionNone
    let result: readonly ExpressionSingleResult[]

    if (shouldSwap) {
      result = (schema2 as ExtendsSchema).compare(schema1)
    } else {
      result = schema1.compare(schema2)
    }
    for (let expression of result) {
      if (shouldSwap) {
        expression = ExtendsContext.swap(expression)
      }
      expressionResult |= toExpression(expression)
    }
    return expressionResult
  }

  public equals(schema1: Schema<unknown>, schema2: Schema<unknown>): boolean {
    const schemaClass = this.findMatchedClass(schema1, schema2)
    const shouldSwap = !(schema1 instanceof schemaClass)
    if (shouldSwap) {
      return (schema2 as ExtendsSchema).equals(schema1)
    } else {
      return schema1.equals(schema2)
    }
  }

  private findMatchedClass(schema1: Schema<unknown>, schema2: Schema<unknown>): ExtendsSchemaClass {
    for (const schemaClass of this.extendsSchemaClasses) {
      if (schema1 instanceof schemaClass) {
        return schemaClass
      }
      if (schema2 instanceof schemaClass) {
        return schemaClass
      }
    }
    throw new Error('Invalid schema')
  }

  private static swap(expression: ExpressionSingleResult): ExpressionSingleResult {
    switch (expression) {
      case ExpressionSingleResult.Containing: {
        return ExpressionSingleResult.ContainedBy
      }
      case ExpressionSingleResult.ContainedBy: {
        return ExpressionSingleResult.Containing
      }
      default: {
        return expression
      }
    }
  }
}
