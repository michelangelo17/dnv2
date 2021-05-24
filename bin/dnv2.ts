#!/usr/bin/env node
import * as cdk from '@aws-cdk/core'
import * as AWS from 'aws-sdk'
import { Dnv2Stack } from '../lib/dnv2-stack'

export const getDataAsyncWrapper = async (): Promise<any> => {
  const s3SDK = new AWS.S3()
  const getS3Data = async () => {
    const params = {
      Bucket: 'BUCKET_CONTAINING_FRONT_END_HERE',
      Key: 'KEY_OF_JSON_FILE',
    }
    try {
      const s3Data = await s3SDK.getObject(params).promise()
      const s3DataString = s3Data.Body && s3Data.Body.toString('utf-8')
      console.log(s3DataString)
      return s3DataString
      //
    } catch (e) {
      throw new Error('FAILED SO HARD!!!')
    }
  }
  const data = await getS3Data().catch((e) => {
    console.log(e)
  })
  return data
}
;(async () => {
  const initializationData = await getDataAsyncWrapper()
  const initdata = JSON.parse(initializationData)

  // Create new Application
  const app = new cdk.App()
  new Dnv2Stack(app, initdata.context.Application.ApplicationName, {
    env: {
      account: 'ACCOUNT_NUMBER',
      region: 'REGION',
    },
  })
})()
