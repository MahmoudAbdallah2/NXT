import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { UserPoolOperation } from 'aws-cdk-lib/aws-cognito';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

export class LambdaApigw1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference an existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'MyVpc', {
      vpcId: 'vpc-04f7e4fc41acfc963' // Replace with the ID of your existing VPC
    });
    
    //Reference subnets
    //const publicUsEast1a = ec2.Subnet.fromSubnetId(this, 'publicUsEast1a', 'subnet-0151793c88471ec27')
    const publicSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });

    //Private Subnets
    const privateSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    });

    //Reference Lambda Role
    const lambdaBasicRole = iam.Role.fromRoleArn(this, 'lambdaBasicRole', 'arn:aws:iam::1234567894522:role/Lambda_role_basic');

    //Reference Lambda Cognito Role
    const lambdaCognitoRole = iam.Role.fromRoleArn(this, 'lambdacognitoRole', 'arn:aws:iam::123456789:role/Lambda-Cognito-Role');

    // Reference SQS Role
    const lambdaSQSRole = iam.Role.fromRoleArn(this, 'lambdaSQSRole', 'arn:aws:iam::123456789123:role/Lambda-SQS-Role');

    // Reference an existing security group
    const lambdaSG = ec2.SecurityGroup.fromSecurityGroupId(this, 'lambdaSG', 'sg-1234567895451');

    // Create a config set for SES
    const ses_logs = new ses.ConfigurationSet(this, 'ses-logs', {
      configurationSetName: 'ses-logs',
      reputationMetrics: true
    });

     // Create SQS Transflo-ComdataEventQueue-DLQ
     const Transflo_ComdataEventQueue = new sqs.Queue(this, "TestEventQueue", {
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      queueName: "TestEventQueue",
      deadLetterQueue: {
        queue: TestEventQueue,
        maxReceiveCount: 10
      }
    });
  
    // define the TransfloExpressFuelPortalCustomerCreationLambda lambda function
    const TransfloExpressFuelPortalCustomerCreationLambdaFunction = new lambda.Function(this, 'TransfloExpressFuelPortalCustomerCreationLambda', {
      runtime: lambda.Runtime.DOTNET_6,
      code: lambda.Code.fromAsset('lambda/TransfloExpressFuelPortalCustomerCreationLambda/publish.zip'), // Path to your .zip file
      handler: 'TransfloExpress.FuelPortal.CustomerCreationLambda::TransfloExpress.FuelPortal.CustomerCreationLambda.Function::FunctionHandler', // The entry point to your Lambda function
      functionName: 'TransfloExpressFuelPortalCustomerCreationLambda', // Optional: Provide a name for your Lambda function
      vpc,
      vpcSubnets: privateSubnets,
      allowPublicSubnet: true,
      securityGroups: [lambdaSG],
      role: lambdaBasicRole,
      timeout: cdk.Duration.seconds(30),
    });

    // Create UserWebPortal Cognito User Pool
    const FuelWebPortalUserPool = new cognito.UserPool(this, 'TestUserPool', {
        userPoolName: 'TestUserPool',
        selfSignUpEnabled: true, // Allow users to sign up themselves
        signInAliases: { username: true}, // Allow signing in with username
        autoVerify: { phone: true, email: true }, // Automatically verify email addresses
        keepOriginal: {
          email: true,
          phone: true,
        },
        userVerification: {
          emailSubject: 'Verify your email',
          emailBody: 'Your verification code is {####}',
          emailStyle: cognito.VerificationEmailStyle.CODE,
          smsMessage: 'Your verification code is {####}',
        },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, // Enable account recovery via email
        standardAttributes: {
          email: {
            required: true,
            mutable: true
          },
          givenName: {
            required: true,
            mutable: true
          },
          familyName: {
            required: true,
            mutable: true
          },
          phoneNumber: {
            required: true,
            mutable: true
          },
        },
        passwordPolicy: {
          minLength: 8, // Set minimum password length
          requireLowercase: true, // Require at least one lowercase letter
          requireUppercase: true, // Require at least one uppercase letter
          requireDigits: true, // Require at least one digit
          requireSymbols: true // Require at least one symbol
        },
        mfa: cognito.Mfa.REQUIRED, // Require users to enable MFA
        mfaSecondFactor: {
          sms: true, otp: false // Enable SMS as the MFA second factor
        },
        signInCaseSensitive: false, // Enable case-sensitive email sign-in
        
      });

      // FuelMobileAppUserPool Cognito Authorizer
    const FuelMobileAppUserPoolCognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'TestCognitoAuthorizer', {
        cognitoUserPools: [TestUserPool]
      });

      // Resource policy defined for private api 
    const resourcePolicy = new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ['execute-api:Invoke'],
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            principals: [new iam.ArnPrincipal('*')],
            conditions: {
              // Add conditions based on your requirements, e.g., source VPC, IP ranges, etc.
            },
          }),
        ],
      });

      // define FuelWebServices Private api gateway
    const TestAPI = new apigateway.RestApi(this, 'TestAPI', {
        restApiName: 'TestAPI',
        policy: resourcePolicy,
        deploy: false,
        endpointConfiguration: {
          types: [apigateway.EndpointType.PRIVATE],
        },
      });

      // Define stage at deploy time
    const STAGE = process.env.STAGE || 'QA'

    // Deploy the API to the stage
    const deployment = new apigateway.Deployment(this, 'MyDeployment', {
        api: TestAPI,
        description: 'Initial deployment',
      });

      // Create a stage
    const stage = new apigateway.Stage(this, 'MyStage', {
        stageName: STAGE,
        deployment,
        variables: {
          environment: 'QA',
        },
      });

      // Assign the stage
    TestAPI.deploymentStage = stage;

    // Create a Lambda integration for the API endpoint
    const TestlambdaIntegration = new apigateway.LambdaIntegration(TestLambdaFunction, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Content-Type': "'application/json'",
            },
      }
    ]
    });

    // Define the API endpoint resources for TestAPI
    const TestResource = TestAPI.root.addResource('Test');
    const v1Resource = TestResource.addResource('V1');
    const customerResource = v1Resource.addResource('Customer');

    // **FUELPORTAL** Add the response model for the application/json content type
    const responseModel = TestAPI.addModel('EmptyResponseModel', {
        contentType: 'application/json',
        modelName: 'EmptyResponse',
        schema: { type: apigateway.JsonSchemaType.OBJECT },
      });

    //Define POST Method under customer resource with Customer Creation Lambda function
    const customerPOSTMethod = customerResource.addMethod('POST',TestlambdaIntegration, {
        methodResponses: [
          {
            statusCode: '200',
            responseModels:{
              'application/json': responseModel,
            },
            responseParameters: {
              'method.response.header.Content-Type': true ,
            },
          },
        ],
        requestModels: {
          'application/json': apigateway.Model.EMPTY_MODEL,
        },
        authorizer: TestCognitoAuthorizer
    });