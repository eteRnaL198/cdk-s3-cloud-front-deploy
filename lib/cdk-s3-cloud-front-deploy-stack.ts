import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class CdkS3CloudFrontDeployStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucketName: string = this.node.tryGetContext('s3').bucketName;
    const bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName: bucketName,
      // Bucketへの直接アクセスを禁止
      accessControl: s3.BucketAccessControl.PRIVATE,
      // CDK Stack削除時にBucketも削除する
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
    });

    // S3を公開状態にせず､S3へのアクセスをCloudFrontからのリクエストに絞るための仕組み
    const identity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
      comment: `${bucket.bucketName} access identity`,
    });

    // principalsに設定したアクセス元からのみにS3バケットのGetObject権限を渡す
    // ポリシーの設定によりS3バケットのオブジェクトはCloudFrontを介してのみアクセスできる
    const bucketPolicyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      effect: iam.Effect.ALLOW,
      principals: [identity.grantPrincipal],
      resources: [`${bucket.bucketArn}/*`],
    });
    //bucketにポリシーをアタッチ
    bucket.addToResourcePolicy(bucketPolicyStatement);
    // CloudFrontのdistribution作成
    new cloudfront.CloudFrontWebDistribution(this, 'WebDistributon', {
      enableIpV6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
            originAccessIdentity: identity,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
              cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD,
              forwardedValues: {
                queryString: false,
              }
            }
          ]
        }
      ],
      // 403/404エラーはindex.htmlを表示
      errorConfigurations: [
        {
          errorCode: 403,
          responseCode: 200,
          errorCachingMinTtl: 0,
          responsePagePath: '/index.html',
        },
        {
          errorCode: 404,
          responseCode: 200,
          errorCachingMinTtl: 0,
          responsePagePath: '/index.html',
        }
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    })

    
    // lamda
    const uploadObject = new lambda.Function(this, 'UploadObjectHandler', {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'upload-object.handler',
    })

  }
}
